import OpenAI from "openai";
import { sentimentAnalysisService } from "./sentiment-analysis";
import { hallucinationPreventionService } from "./hallucination-prevention";
import { aiAgentSignatureService } from "./ai-agent-signature";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

interface EmpathyContext {
  sentiment: string;
  negativeScore: number;
  confidence: number;
  customerEmotion: 'calm' | 'disappointed' | 'frustrated' | 'angry' | 'desperate';
  urgencyLevel: 'low' | 'medium' | 'high' | 'critical';
}

interface ResponseContext {
  classification: string;
  customerName?: string;
  orderNumber?: string;
  companyName?: string;
  specificIssue: string;
  availableActions: string[];
  orderData?: any;
  productData?: any;
  cancellationData?: any;
}

export interface EmpatheticResponse {
  subject: string;
  body: string;
  bodyWithSignature: string;
  tone: 'professional' | 'empathetic' | 'apologetic' | 'urgent';
  confidenceScore: number;
  emotionalAcknowledgment: string;
}

class EmpatheticResponseGenerator {
  
  /**
   * Generate dynamic empathetic response based on customer emotion and issue context
   */
  async generateResponse(
    userId: string,
    emailContent: string,
    emailSubject: string,
    classification: string,
    responseContext: ResponseContext,
    empathyLevel: number = 3,
    customerEmail?: string,
    isFirstReply?: boolean
  ): Promise<EmpatheticResponse> {
    
    console.log('[EMPATHETIC_GENERATOR] Starting response generation:', {
      classification,
      responseContext,
      empathyLevel
    });
    
    // Step 1: Analyze customer emotional state
    const empathyContext = await this.analyzeCustomerEmotion(emailContent);
    
    // Step 2: Get grounded knowledge for accurate problem-solving
    let groundedContext = {};
    try {
      console.log('[EMPATHETIC_GENERATOR] Fetching grounded context...');
      const knowledgeBase = await hallucinationPreventionService.getRelevantKnowledge(
        userId,
        `${emailSubject} ${emailContent}`
      );
      groundedContext = { 
        relevantContent: knowledgeBase.relevantContent.slice(0, 3),
        hasTrainingData: knowledgeBase.hasTrainingData
      };
      console.log('[EMPATHETIC_GENERATOR] Grounded context received:', {
        hasRelevantContent: !!(groundedContext?.relevantContent?.length > 0),
        contentCount: groundedContext?.relevantContent?.length || 0,
        hasTrainingData: groundedContext?.hasTrainingData
      });
    } catch (error) {
      console.error('[EMPATHETIC_GENERATOR] Failed to retrieve grounded context:', error);
      groundedContext = { relevantContent: [], hasTrainingData: false };
    }
    
    // Step 2.5: Check loyal customer status and settings if this is the first reply
    let loyalCustomerGreeting = '';
    if (isFirstReply && customerEmail) {
      const { storage } = await import('../storage');
      const settings = await storage.getSystemSettings(userId);
      
      if (settings?.loyalCustomerGreeting) {
        const { orderLookupService } = await import('./order-lookup');
        const isRepeat = await orderLookupService.isRepeatCustomer(customerEmail, userId);
        
        if (isRepeat) {
          const companyName = settings?.companyName || 'our company';
          loyalCustomerGreeting = `Thank you for being a loyal ${companyName} customer, we appreciate your business! `;
        }
      }
    }

    // Step 3: Generate contextual empathetic response
    const response = await this.craftEmpatheticResponse(
      empathyContext,
      responseContext,
      groundedContext,
      emailContent,
      emailSubject,
      empathyLevel,
      loyalCustomerGreeting,
      userId
    );
    
    // CRITICAL: Log AI agent activity for user visibility
    try {
      const { storage } = await import('../storage');
      await storage.createActivityLog({
        userId,
        action: `Generated ${responseContext.classification} response`,
        type: 'ai_agent',
        executedBy: 'ai',
        customerEmail: customerEmail || 'unknown',
        orderNumber: responseContext.orderNumber || undefined,
        details: `AI agent crafted empathetic response for ${responseContext.classification} inquiry. Confidence: ${empathyContext.confidence}%, Empathy level: ${empathyLevel}/5, Customer emotion: ${empathyContext.customerEmotion}`,
        status: 'completed',
        metadata: {
          classification: responseContext.classification,
          specificIssue: responseContext.specificIssue,
          availableActions: responseContext.availableActions,
          customerEmotion: empathyContext.customerEmotion,
          urgencyLevel: empathyContext.urgencyLevel,
          empathyLevel,
          confidenceScore: response.confidenceScore,
          orderData: responseContext.orderData ? {
            hasOrderData: true,
            orderStatus: responseContext.orderData.status,
            trackingAvailable: !!responseContext.orderData.trackingNumber
          } : { hasOrderData: false }
        }
      });
    } catch (logError) {
      console.warn('Failed to log AI agent activity:', logError);
      // Don't fail the response if logging fails
    }
    
    return response;
  }
  
  /**
   * Analyze customer emotional state for empathy calibration
   */
  private async analyzeCustomerEmotion(emailContent: string): Promise<EmpathyContext> {
    // Get sentiment analysis from Amazon Comprehend
    const sentiment = await sentimentAnalysisService.analyzeSentiment(emailContent);
    
    // Map sentiment to customer emotion levels
    let customerEmotion: EmpathyContext['customerEmotion'] = 'calm';
    let urgencyLevel: EmpathyContext['urgencyLevel'] = 'low';
    
    const negativeScore = sentiment.scores.negative || 0;
    
    if (negativeScore > 80) {
      customerEmotion = 'angry';
      urgencyLevel = 'critical';
    } else if (negativeScore > 60) {
      customerEmotion = 'frustrated';
      urgencyLevel = 'high';
    } else if (negativeScore > 40) {
      customerEmotion = 'disappointed';
      urgencyLevel = 'medium';
    } else {
      customerEmotion = 'calm';
      urgencyLevel = 'low';
    }
    
    // Override for specific urgent keywords
    const urgentIndicators = ['emergency', 'urgent', 'asap', 'immediately', 'critical', 'lawsuit', 'lawyer'];
    const hasUrgentKeywords = urgentIndicators.some(keyword => 
      emailContent.toLowerCase().includes(keyword)
    );
    
    if (hasUrgentKeywords) {
      urgencyLevel = 'critical';
      if (customerEmotion === 'calm') {
        customerEmotion = 'desperate';
      }
    }
    
    return {
      sentiment: sentiment.sentiment,
      negativeScore,
      confidence: sentiment.confidence,
      customerEmotion,
      urgencyLevel
    };
  }
  
  /**
   * Craft empathetic response using GPT-4o with emotional intelligence
   */
  private async craftEmpatheticResponse(
    empathy: EmpathyContext,
    context: ResponseContext,
    groundedContext: any,
    originalEmail: string,
    originalSubject: string,
    empathyLevel: number = 3,
    loyalCustomerGreeting: string = '',
    userId: string = ''
  ): Promise<EmpatheticResponse> {
    
    const prompt = `You are an expert customer service representative drafting a response email. Your job is to craft empathetic, solution-focused DRAFT responses that acknowledge the customer's emotional state and explain what CAN be done to help.

IMPORTANT: This is a DRAFT response that will be reviewed before any actions are taken. Do NOT claim that actions have already been completed.

CUSTOMER EMOTIONAL STATE:
- Emotion Level: ${empathy.customerEmotion}
- Negative Sentiment: ${empathy.negativeScore}%
- Urgency: ${empathy.urgencyLevel}

CUSTOMER ISSUE:
- Classification: ${context.classification}
- Specific Issue: ${context.specificIssue}
- Order Number: ${context.orderNumber || 'Not provided'}
- Available Actions: ${context.availableActions.join(', ')}

${context.orderData ? `
REAL ORDER DATA (Use this specific information instead of placeholders):
- Order Status: ${context.orderData.status}
- Tracking Number: ${context.orderData.trackingNumber}
- Estimated Delivery: ${context.orderData.estimatedDelivery}
- Tracking URL: ${context.orderData.trackingUrl}
` : ''}

RESPONSE GUIDELINES:

1. **EMOTIONAL ACKNOWLEDGMENT** (Critical for ${empathy.customerEmotion} customers):
   ${this.getEmotionalGuidance(empathy.customerEmotion)}

2. **DRAFT SOLUTION FOCUS**:
   - Explain what CAN be done to help (not what has been done)
   - Use phrases like "I can help you", "I'm able to", "Let me assist you"
   - NEVER use phrases like "I have completed", "I've already", "Done", etc.
   - Be clear about next steps and what will happen when approved

3. **EMPATHY LEVEL CALIBRATION** (Level ${empathyLevel}/5):
   ${this.getEmpathyGuidance(empathyLevel)}

4. **TONE CALIBRATION**:
   - Calm customers: Professional and helpful
   - Disappointed customers: Understanding and solution-focused  
   - Frustrated customers: Empathetic and action-oriented
   - Angry customers: Apologetic, urgent, and results-driven

5. **GROUNDED KNOWLEDGE**:
   ${groundedContext.relevantContent && groundedContext.relevantContent.length > 0 ? `
   REAL TRAINING DATA (Use this specific information to answer the customer):
   ${groundedContext.relevantContent.map((content: any, index: number) => `
   ${index + 1}. ${typeof content === 'string' ? content : content.content || content.text || JSON.stringify(content)}`).join('\n')}
   CRITICAL: Answer using ONLY the above training data. Never use placeholders.
   ` : `
   NO TRAINING DATA AVAILABLE - Generate low confidence response and suggest escalation to human.
   `}

6. **SIGNATURE HANDLING**:
   CRITICAL: DO NOT include any signature, sign-off, or closing in your response body. 
   - DO NOT add "Best regards", "Sincerely", "Thank you", etc.
   - DO NOT add "[Your Name]", agent names, or any signatures
   - The response body should end with the helpful content only
   - A professional signature will be automatically added separately

${loyalCustomerGreeting ? `7. **LOYAL CUSTOMER GREETING**:
   Start the email body with: "${loyalCustomerGreeting}"
   This should come immediately after "Hi [Name]," in the greeting.` : ''}

ORIGINAL CUSTOMER EMAIL:
Subject: ${originalSubject}
Content: ${originalEmail}

Generate a DRAFT response that:
1. Acknowledges their emotional state appropriately
2. ${loyalCustomerGreeting ? 'Includes the loyal customer greeting as the first sentence after the name greeting' : 'Starts with appropriate greeting'}
3. Explains what CAN be done to help (draft language, not completed actions)
4. Uses empathetic language that matches their frustration level
5. Includes subject line and email body (NO SIGNATURE - this will be added separately)
6. NEVER uses templates - every response should be dynamically crafted  
7. CRITICAL: Use future tense or conditional language - "I can help you pause", "Let me assist with", "I'm able to process" (NOT "I have paused", "I've completed")
8. NEVER include closing signatures, sign-offs, or agent names - these are added automatically
${context.orderData ? `9. IMPORTANT: Use the REAL ORDER DATA provided above. Include specific order status, tracking numbers, and delivery dates - NO placeholders like [ORDER_STATUS] or [TRACKING_NUMBER]` : ''}

Examples of CORRECT draft language:
- Subscription: "I can help you pause your subscription right away. Would you like me to set a reactivation date?"
- Order Status: "I can provide you with the current status of your order"
- Refund: "I'm able to process a refund for your order"

Examples of INCORRECT language (DO NOT USE):
- "I have paused your subscription" ❌
- "Your refund has been processed" ❌  
- "I've updated your order" ❌

Respond with JSON:
{
  "subject": "Re: [specific subject acknowledging their issue]",
  "body": "[Empathetic DRAFT response explaining what CAN be done]",
  "tone": "professional|empathetic|apologetic|urgent",
  "confidenceScore": 95,
  "emotionalAcknowledgment": "[Brief description of how you acknowledged their emotion]"
}`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o", // the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
      messages: [
        {
          role: "system",
          content: "You are an expert customer service AI with exceptional emotional intelligence. Generate empathetic, solution-focused responses that acknowledge customer emotions while providing instant help."
        },
        {
          role: "user", 
          content: prompt
        }
      ],
      response_format: { type: "json_object" },
      temperature: 0.7 // Allow creativity for empathetic responses
    });
    
    const result = JSON.parse(response.choices[0].message.content || '{}');
    
    // Generate personalized AI agent signature  
    const { aiAgentSignatureService } = await import('./ai-agent-signature');
    const aiSignature = await aiAgentSignatureService.generateAIAgentSignature(userId);
    const bodyWithSignature = `${result.body}\n\n${aiSignature}`;
    
    return {
      subject: result.subject,
      body: result.body,
      bodyWithSignature,
      tone: result.tone,
      confidenceScore: result.confidenceScore,
      emotionalAcknowledgment: result.emotionalAcknowledgment
    };
  }
  
  /**
   * Get emotional response guidance based on customer state
   */
  private getEmotionalGuidance(emotion: EmpathyContext['customerEmotion']): string {
    switch (emotion) {
      case 'angry':
        return "Start with sincere apology, acknowledge their frustration is completely understandable, emphasize immediate action";
      case 'frustrated':
        return "Acknowledge their frustration, show understanding of their situation, focus on quick resolution";
      case 'disappointed':
        return "Validate their disappointment, show you understand their expectations weren't met, provide hopeful solution";
      case 'desperate':
        return "Recognize the urgency, acknowledge their stress, provide immediate reassurance and action";
      case 'calm':
        return "Be professional and helpful, focus on efficient problem-solving";
      default:
        return "Match their tone and energy level appropriately";
    }
  }

  /**
   * Generate empathy guidance based on configured empathy level
   */
  private getEmpathyGuidance(level: number): string {
    switch(level) {
      case 1: 
        return "- Use minimal emotional language, focus on facts and solutions\n   - Be professional and direct\n   - Avoid emotional validation phrases";
      case 2:
        return "- Show some understanding without being overly emotional\n   - Use phrases like 'I understand' sparingly\n   - Maintain professional tone";
      case 3:
        return "- Acknowledge customer feelings appropriately\n   - Use moderate empathy: 'I understand this is frustrating'\n   - Balance emotion with solution-focus";
      case 4:
        return "- Actively validate emotions and show strong empathy\n   - Use phrases like 'I completely understand how upsetting this must be'\n   - Show genuine concern for their experience";
      case 5:
        return "- Provide maximum emotional support and validation\n   - Use deeply empathetic language: 'I sincerely apologize for how this has affected you'\n   - Make the customer feel truly heard and supported";
      default:
        return "- Use moderate empathy and professional understanding";
    }
  }
}

export const empatheticResponseGenerator = new EmpatheticResponseGenerator();