import { storage } from "../storage";
import { emailRoutingService } from "./email-routing";
import { promoRefundService } from "./promo-refund";
import { contentSafetyService } from "./content-safety";
import { sentimentAnalysisService } from "./sentiment-analysis";
import { hallucinationPreventionService } from "./hallucination-prevention";
import { empatheticResponseGenerator } from "./empathetic-response-generator";
import OpenAI from "openai";
import { aiAgentSignatureService } from "./ai-agent-signature";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export interface ClassificationResult {
  classification: string;
  confidence: number;
  reasoning: string;
  priority?: 'low' | 'medium' | 'high' | 'urgent';
  priorityReasoning?: string;
}

export interface ProcessedEmail {
  id: string;
  classification: string;
  confidence: number;
  autoResponseSent: boolean;
  escalated: boolean;
  ruleUsed?: string;
  awaitingApproval?: boolean;
}

class AutoResponderService {
  
  /**
   * Classify incoming email using OpenAI with hallucination prevention
   */
  async classifyEmail(emailContent: string, subject: string, userId?: string): Promise<ClassificationResult> {
    try {
      const prompt = `
You are an expert customer service AI that understands customer intent, not just keywords. Analyze the underlying meaning and context of this email.

CUSTOMER INTENT CATEGORIES:

1. **order_status** (WISMO - Where Is My Order)
   - Intent: Customer wants to know where their order is, when it will arrive, or why it hasn't arrived
   - Context: Any concern about order location, delivery timing, shipping progress
   - Examples: "Where is my order?", "Expected yesterday but not here", "Haven't received my package", "Order #123 status?"

2. **promo_refund** 
   - Intent: Customer wants money back or has billing/payment concerns
   - Context: Financial disputes, refund requests, charge issues

3. **order_cancellation**
   - Intent: Customer wants to stop an order before it ships
   - Context: Prevent shipment, cancel before processing

4. **return_request**
   - Intent: Customer wants to exchange or return a received product
   - Context: Product exchanges, returns (not necessarily for refund)

5. **subscription_changes**
   - Intent: Customer wants to modify their ongoing subscription
   - Context: Pause, resume, change contents, modify schedule

6. **cancellation_requests**
   - Intent: Customer wants to end their subscription/account permanently
   - Context: Terminate service, close account

7. **payment_issues**
   - Intent: Customer has problems with payment processing
   - Context: Failed payments, payment method issues

8. **address_change**
   - Intent: Customer wants to change shipping address
   - Context: Update delivery location

9. **product**
   - Intent: Customer has questions about product features or specifications
   - Context: Product information, compatibility, usage

10. **escalation**
    - Intent: Customer is frustrated, threatening, or has complex multi-issue problems
    - Context: Complaints, legal threats, multiple failed attempts

11. **general**
    - Intent: Simple questions, compliments, basic inquiries
    - Context: Only use if no specific intent is clear

PRIORITY ASSESSMENT:
- **urgent**: Events tomorrow, damaged goods, safety issues
- **high**: Delayed orders, upset customers, payment problems, billing disputes  
- **medium**: Standard requests, general order questions, subscription changes
- **low**: Simple questions, compliments, product info requests

ANALYSIS INSTRUCTIONS:
1. Read the email content to understand the customer's underlying concern and emotional state
2. Identify the primary intent - what does the customer actually want?
3. Consider context clues like order numbers, timing expressions, emotional language
4. Assign appropriate priority based on urgency and customer sentiment
5. Be confident in your assessment - modern AI should easily understand customer intent

Email Subject: ${subject}
Email Content: ${emailContent}

Respond with JSON:
{
  "classification": "category_name",
  "confidence": 85,
  "reasoning": "Brief explanation of the customer's intent and why this classification matches",
  "priority": "urgent|high|medium|low", 
  "priorityReasoning": "Why this priority level was assigned based on urgency and customer sentiment"
}
      `;

      // UPGRADED: Use vector embeddings with hallucination prevention
      if (userId) {
        console.log('[AUTO_RESPONDER] Using enhanced classification with vector embeddings');
        const groundedResult = await hallucinationPreventionService.classifyWithGrounding(
          userId,
          emailContent,
          subject
        );
        
        return {
          classification: groundedResult.classification,
          confidence: groundedResult.confidence,
          reasoning: `Vector-enhanced: ${groundedResult.reasoning}`,
          priority: groundedResult.priority,
          priorityReasoning: groundedResult.priorityReasoning
        };
      }

      // Fallback for users without training data
      const response = await openai.chat.completions.create({
        model: "gpt-4o", // the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" },
        temperature: 0.3,
      });

      const result = JSON.parse(response.choices[0].message.content || '{}');
      
      return {
        classification: result.classification || 'general',
        confidence: Math.max(0, Math.min(100, result.confidence || 50)),
        reasoning: result.reasoning || 'AI classification result',
        priority: result.priority || 'medium',
        priorityReasoning: result.priorityReasoning || 'Standard priority assignment'
      };
    } catch (error) {
      console.error('Email classification error:', error);
      return {
        classification: 'general',
        confidence: 30,
        reasoning: 'Classification failed, defaulting to general',
        priority: 'medium',
        priorityReasoning: 'Default priority due to classification failure'
      };
    }
  }

  /**
   * Find matching auto-responder rule for classification
   */
  async findMatchingRule(userId: string, classification: string, confidence: number) {
    const rules = await storage.getAutoResponderRules(userId);
    
    // Find exact classification match first
    let matchingRule = rules.find((rule: any) => 
      rule.classification === classification && 
      rule.isActive
    );

    // If no exact match and confidence is low, try general fallback
    if (!matchingRule && confidence < 70) {
      matchingRule = rules.find((rule: any) => 
        rule.classification === 'general' && 
        rule.isActive
      );
    }

    return matchingRule;
  }

  /**
   * Process incoming email with auto-responder logic
   */
  async processIncomingEmail(userId: string, emailData: {
    fromEmail: string;
    toEmail: string;
    subject: string;
    body: string;
    messageId?: string;
  }): Promise<ProcessedEmail> {
    
    // Store the email in database
    const email = await storage.createEmail({
      userId,
      fromEmail: emailData.fromEmail,
      toEmail: emailData.toEmail,
      subject: emailData.subject,
      body: emailData.body,
      status: 'processing',
      metadata: {
        messageId: emailData.messageId,
        receivedAt: new Date().toISOString()
      }
    });

    // CRITICAL: Link email to thread for conversation context
    try {
      const { ThreadContextService } = await import('./thread-context');
      await ThreadContextService.linkEmailToThread(
        email.id,
        emailData.subject,
        emailData.fromEmail,
        emailData.toEmail
      );
    } catch (error) {
      console.error('Failed to link email to thread:', error);
      // Continue processing - thread linking is not critical for basic functionality
    }

    // Classify the email with hallucination prevention
    const classification = await this.classifyEmail(emailData.body, emailData.subject, userId);
    
    // SENTIMENT ANALYSIS - Check for negative sentiment that needs immediate escalation
    let sentimentEscalation = false;
    let sentimentReason = '';
    try {
      const { sentimentAnalysisService } = await import('./sentiment-analysis');
      const sentimentResult = await sentimentAnalysisService.analyzeSentiment(emailData.body);
      
      // Escalate highly negative sentiment emails immediately
      if (sentimentResult.sentiment === 'NEGATIVE') {
        const negativeScore = sentimentResult.scores.negative || 0;
        const sentimentConfidence = sentimentResult.confidence || 0;
        
        if (negativeScore > 75 && sentimentConfidence > 90) {
          sentimentEscalation = true;
          sentimentReason = `Very angry customer detected (${negativeScore}% negative sentiment with ${sentimentConfidence}% confidence)`;
        } else if (negativeScore > 85 && sentimentConfidence > 80) {
          sentimentEscalation = true;
          sentimentReason = `Highly frustrated customer detected (${negativeScore}% negative sentiment)`;
        }
      }
      
      console.log(`[AUTO_RESPONDER] Sentiment analysis: ${sentimentResult.sentiment} (${sentimentResult.confidence}% confidence)`);
      if (sentimentEscalation) {
        console.log(`[AUTO_RESPONDER] Sentiment escalation triggered: ${sentimentReason}`);
      }
    } catch (sentimentError) {
      console.warn('[AUTO_RESPONDER] Sentiment analysis failed:', sentimentError);
      // Continue without sentiment analysis if it fails
    }
    
    // Update email with classification
    await storage.updateEmail(email.id, {
      classification: classification.classification,
      confidence: classification.confidence,
      metadata: {
        ...(email.metadata as any || {}),
        classificationReasoning: classification.reasoning
      }
    });

    // Check if should escalate based on confidence, classification, or negative sentiment
    if (classification.confidence < 60 || classification.classification === 'escalation' || sentimentEscalation) {
      const escalationReason = sentimentEscalation 
        ? `Negative sentiment detected - ${sentimentReason}`
        : undefined;
      
      // Override priority for sentiment-based escalations
      let escalationClassification = classification;
      if (sentimentEscalation) {
        escalationClassification = {
          ...classification,
          priority: sentimentReason.includes('Very angry') ? 'urgent' : 'high',
          priorityReasoning: `Escalated due to negative sentiment: ${sentimentReason}`
        };
      }
      
      return await this.escalateEmail(email.id, userId, escalationClassification, escalationReason);
    }

    // Find matching auto-responder rule
    const rule = await this.findMatchingRule(userId, classification.classification, classification.confidence);
    
    if (!rule) {
      // No rule found, escalate
      return await this.escalateEmail(email.id, userId, classification, 'No matching auto-responder rule');
    }

    // Check if approval is required
    const settings = await storage.getSystemSettings(userId);
    const approvalRequired = settings?.automationApprovalRequired ?? true; // Default to requiring approval

    if (approvalRequired) {
      // Create approval queue item instead of executing immediately
      const responseData = await this.generateProposedResponse(rule, emailData, userId);
      
      await storage.createAutomationApprovalItem({
        userId,
        emailId: email.id,
        ruleId: rule.id,
        customerEmail: emailData.fromEmail,
        subject: emailData.subject,
        body: emailData.body,
        classification: classification.classification,
        confidence: responseData.adjustedConfidence, // Use sentiment-aware confidence
        proposedResponse: responseData.response,
        status: 'pending',
        metadata: {
          originalMessageId: emailData.messageId,
          classificationReasoning: classification.reasoning,
          priority: classification.priority,
          priorityReasoning: classification.priorityReasoning,
          originalConfidence: classification.confidence,
          sentimentAdjustedConfidence: responseData.adjustedConfidence,
          // Include real data for UI display
          orderData: responseContext.orderData,
          cancellationData: responseContext.cancellationData,
          promoRefundData: responseContext.promoRefundData,
          productData: responseContext.productData
        }
      });

      // Update email status to awaiting approval
      await storage.updateEmail(email.id, {
        status: 'awaiting_approval',
        metadata: {
          ...(email.metadata as any || {}),
          awaitingApproval: true,
          ruleId: rule.id
        }
      });

      // Log activity
      await storage.createActivityLog({
        userId,
        action: 'Queued for approval',
        type: 'email_processed',
        executedBy: 'ai',
        customerEmail: emailData.fromEmail,
        details: `AI classified email as ${classification.classification} and queued automation for approval`,
        status: 'pending',
        metadata: {
          ruleId: rule.id,
          ruleName: rule.name,
          classification: classification.classification,
          confidence: classification.confidence
        }
      });

      return {
        id: email.id,
        classification: classification.classification,
        confidence: classification.confidence,
        autoResponseSent: false,
        escalated: false,
        awaitingApproval: true,
        ruleUsed: rule.name
      };
    }

    // Execute automation immediately (approval not required)
    let responseSuccess = false;
    if (classification.classification === 'promo_refund') {
      // First try the enhanced promo refund service for sophisticated code handling
      const { enhancedPromoRefundService } = await import('./enhanced-promo-refund');
      const enhancedResult = await enhancedPromoRefundService.processEnhancedPromoRefund(
        email.id,
        emailData.fromEmail,
        emailData.subject,
        emailData.body,
        userId
      );

      if (enhancedResult.success) {
        responseSuccess = true;
      } else if (enhancedResult.shouldEscalate) {
        // Enhanced service recommends escalation, fall back to original service
        responseSuccess = await promoRefundService.processPromoRefund(
          email.id, 
          emailData.fromEmail, 
          userId, 
          rule
        );
      }
    } else if (classification.classification === 'order_cancellation') {
      // Handle order cancellation requests - use the full sophisticated workflow
      const { orderCancellationService } = await import('./order-cancellation');
      const result = await orderCancellationService.initiateCancellationWorkflow(
        userId,
        email.id,
        emailData.fromEmail,
        emailData.subject,
        emailData.body
      );
      responseSuccess = result.success;
    } else if (classification.classification === 'address_change') {
      // Handle address change requests
      const { addressChangeService } = await import('./address-change');
      // Initialize address change workflow directly
      const result = await addressChangeService.initiateAddressChangeWorkflow(
        userId,
        email.id,
        emailData.fromEmail,
        emailData.subject,
        emailData.body
      );
      responseSuccess = result.success;
    } else {
      // Send empathetic auto-response (using revolutionary empathetic generator)
      console.log('[AUTO_RESPONDER] Non-approval flow - using empathetic generator for immediate response');
      const responseData = await this.generateProposedResponse(rule, emailData, userId);
      
      // Send the empathetic response immediately
      responseSuccess = await this.sendEmpathicAutoResponse(userId, emailData.fromEmail, responseData.response, emailData.subject);
    }
    
    if (responseSuccess) {
      // Update rule usage statistics
      await storage.updateAutoResponderRule(rule.id, {
        triggerCount: (rule.triggerCount || 0) + 1,
        lastTriggered: new Date()
      });

      // Update email status
      await storage.updateEmail(email.id, {
        status: 'resolved',
        isResponded: true,
        aiResponse: rule.template,
        processedAt: new Date()
      });

      // Log activity
      await storage.createActivityLog({
        userId,
        action: 'Sent automated reply',
        type: 'email_processed',
        executedBy: 'ai',
        customerEmail: emailData.fromEmail,
        details: `AI automatically sent ${classification.classification} response using rule: ${rule.name}`,
        status: 'completed',
        metadata: {
          ruleId: rule.id,
          ruleName: rule.name,
          classification: classification.classification,
          confidence: classification.confidence
        }
      });

      return {
        id: email.id,
        classification: classification.classification,
        confidence: classification.confidence,
        autoResponseSent: true,
        escalated: false,
        ruleUsed: rule.name
      };
    } else {
      // Failed to send response, escalate
      return await this.escalateEmail(email.id, userId, classification, 'Failed to send auto-response');
    }
  }

  /**
   * Generate empathetic proposed response for approval queue
   * REVOLUTIONARY: Uses dynamic emotional intelligence instead of rigid templates
   */
  async generateProposedResponse(rule: any, emailData: { subject: string; body: string; fromEmail: string }, userId: string): Promise<{ response: string; adjustedConfidence: number }> {
    console.log('[AUTO_RESPONDER] generateProposedResponse called for classification:', rule?.classification);
    
    // Using the revolutionary empathetic response generator (now imported at top)
    console.log('[AUTO_RESPONDER] Using empathetic response generator...');
    
    try {
      // Extract order number if present
      const orderNumber = this.extractOrderNumber(emailData.body);
      
      // Get company name and empathy level from settings
      const settings = await storage.getSystemSettings(userId);
      const companyName = settings?.companyName || 'Our Company';
      const empathyLevel = settings?.empathyLevel || 3; // Default to level 3
      
      // Define context based on classification - now with real order data fetching
      const responseContext = await this.buildResponseContext(rule.classification, {
        orderNumber,
        companyName,
        emailData,
        rule,
        userId
      });
      
      // Check if this is the first reply in the thread for loyal customer greeting
      const { ThreadContextService } = await import('./thread-context');
      const threadContext = emailData.messageId ? 
        await ThreadContextService.getThreadContext(emailData.messageId) : null;
      const isFirstReply = !threadContext || threadContext.emails.length <= 1;
      
      // Generate empathetic response using AI emotional intelligence with custom empathy level
      const empatheticResponse = await empatheticResponseGenerator.generateResponse(
        userId,
        emailData.body,
        emailData.subject,
        rule.classification,
        responseContext,
        empathyLevel,
        emailData.fromEmail,
        isFirstReply
      );
      
      // Get AI agent signature with personalized name and title
      const { aiAgentSignatureService } = await import('./ai-agent-signature');
      const aiSignature = await aiAgentSignatureService.generateAIAgentSignature(userId);

      // Format as complete email with personalized AI agent signature
      const fullResponse = `${empatheticResponse.body}

${aiSignature}`;

      return {
        response: fullResponse,
        adjustedConfidence: empatheticResponse.confidenceScore
      };
      
    } catch (error) {
      console.error('[AUTO_RESPONDER] Empathetic response generation failed:', error);
      console.error('[AUTO_RESPONDER] Error details:', {
        message: error.message,
        stack: error.stack,
        emailData,
        userId,
        rule: rule?.classification
      });
      
      // Fallback: Generate low confidence escalation response (no more placeholder templates)
      return this.generateLegacyResponse(rule, emailData, userId);
    }
  }
  
  /**
   * Build response context for empathetic generation with real order data
   */
  private async buildResponseContext(classification: string, data: any) {
    const baseContext = {
      classification,
      customerName: data.emailData?.fromEmail ? data.emailData.fromEmail.split('@')[0] : 'Customer', // Extract name from email safely
      orderNumber: data.orderNumber,
      companyName: data.companyName,
      specificIssue: this.identifySpecificIssue(classification, data.emailData?.body || ''),
      availableActions: this.getAvailableActions(classification, data.rule)
    };
    
    // For order status inquiries, fetch real order data instead of using placeholders
    if (classification === 'order_status' && data.orderNumber) {
      try {
        const { orderLookupService } = await import('./order-lookup');
        const orderData = await orderLookupService.lookupOrder(data.orderNumber, data.userId);
        
        if (orderData && orderData.success) {
          baseContext.orderData = {
            status: orderData.status || 'Processing',
            trackingNumber: orderData.tracking_code || 'Not available yet',
            estimatedDelivery: orderData.estimated_delivery ? 
              new Date(orderData.estimated_delivery).toLocaleDateString() : 
              'Will be updated soon',
            trackingUrl: orderData.tracking_url || '#'
          };
        }
      } catch (error) {
        console.warn('[AUTO_RESPONDER] Could not fetch real order data:', error);
        // Keep base context without order data if lookup fails
      }
    }

    // For order cancellation, fetch real order data and workflow details
    if (classification === 'order_cancellation' && data.orderNumber) {
      try {
        const { orderLookupService } = await import('./order-lookup');
        const orderData = await orderLookupService.lookupOrder(data.orderNumber, data.userId);
        
        if (orderData && orderData.success) {
          baseContext.cancellationData = {
            orderNumber: data.orderNumber,
            orderTotal: orderData.total || '0.00',
            orderStatus: orderData.status || 'Unknown',
            orderDate: orderData.date_created ? new Date(orderData.date_created).toLocaleDateString() : 'Unknown',
            refundAmount: orderData.total || '0.00',
            plannedActions: [
              'Send cancellation request to fulfillment center',
              `Process full refund of $${orderData.total || '0.00'}`,
              'Send confirmation email to customer'
            ]
          };
        }
      } catch (error) {
        console.warn('[AUTO_RESPONDER] Could not fetch order cancellation data:', error);
      }
    }

    // For promo refund, calculate actual refund amounts
    if (classification === 'promo_refund' && data.rule) {
      try {
        let refundAmount = '0.00';
        if (data.rule.refundType === 'percentage') {
          // For percentage refunds, we'd need order total to calculate
          const percentage = (data.rule.refundValue * 100).toFixed(0);
          refundAmount = `${percentage}% refund`;
          if (data.rule.refundCap) {
            refundAmount += ` (up to $${data.rule.refundCap})`;
          }
        } else if (data.rule.refundType === 'fixed_amount') {
          refundAmount = `$${data.rule.refundValue}`;
        }

        baseContext.promoRefundData = {
          refundType: data.rule.refundType,
          refundAmount,
          refundValue: data.rule.refundValue,
          refundCap: data.rule.refundCap,
          plannedActions: [
            `Process ${refundAmount} refund`,
            'Apply refund to original payment method',
            'Send confirmation email to customer',
            'Log transaction for accounting'
          ]
        };
      } catch (error) {
        console.warn('[AUTO_RESPONDER] Could not fetch promo refund data:', error);
      }
    }

    // For product questions, fetch real product information from training data
    if (classification === 'product' && data.userId) {
      try {
        const { hallucinationPreventionService } = await import('./hallucination-prevention');
        const emailContent = data.emailData?.body || '';
        const knowledgeBase = await hallucinationPreventionService.getRelevantKnowledge(
          data.userId,
          emailContent
        );
        
        if (knowledgeBase.hasTrainingData && knowledgeBase.relevantContent.length > 0) {
          baseContext.productData = {
            hasRealData: true,
            relevantInfo: knowledgeBase.relevantContent.slice(0, 3), // Top 3 most relevant pieces
            confidence: knowledgeBase.confidence || 0.8,
            plannedActions: [
              'Analyze customer product question',
              'Provide accurate information from knowledge base',
              'Offer additional resources if needed',
              'Ask follow-up questions for clarification'
            ]
          };
        } else {
          baseContext.productData = {
            hasRealData: false,
            message: 'No specific product information available in training data',
            plannedActions: [
              'Acknowledge product inquiry',
              'Escalate to human agent for detailed product information',
              'Provide general contact information'
            ]
          };
        }
      } catch (error) {
        console.warn('[AUTO_RESPONDER] Could not fetch product data:', error);
        baseContext.productData = {
          hasRealData: false,
          error: 'Unable to fetch product information',
          plannedActions: ['Escalate to human agent']
        };
      }
    }
    
    return baseContext;
  }
  
  /**
   * Identify specific customer issue for empathetic response
   */
  private identifySpecificIssue(classification: string, emailBody: string): string {
    const issueMap: { [key: string]: string } = {
      'order_status': 'Order delivery delay or tracking concerns',
      'promo_refund': 'Promotional code or billing issue',
      'return_request': 'Product return or exchange request',
      'subscription_changes': 'Subscription billing or modification concern',
      'order_cancellation': 'Request to cancel pending order',
      'address_change': 'Shipping address update needed',
      'product': 'Product information or compatibility question'
    };
    
    return issueMap[classification] || 'General customer service inquiry';
  }
  
  /**
   * Get available actions for this classification
   */
  private getAvailableActions(classification: string, rule: any): string[] {
    const actionMap: { [key: string]: string[] } = {
      'order_status': ['Check tracking information', 'Provide delivery update', 'Offer expedited shipping'],
      'promo_refund': ['Validate promo code', 'Process refund', 'Apply manual discount'],
      'return_request': ['Generate return label', 'Process exchange', 'Initiate refund'],
      'subscription_changes': ['Modify subscription', 'Update billing', 'Adjust delivery schedule'],
      'order_cancellation': ['Cancel order if possible', 'Process refund', 'Stop shipment'],
      'address_change': ['Update shipping address', 'Confirm new delivery location'],
      'product': ['Provide product information', 'Check compatibility', 'Recommend alternatives']
    };
    
    return actionMap[classification] || ['Provide customer assistance', 'Address customer concern'];
  }
  
  /**
   * Extract order number from email content
   */
  private extractOrderNumber(emailBody: string): string | null {
    const orderPatterns = [
      /order\s*#?\s*(\d+)/i,
      /order\s*number\s*#?\s*(\d+)/i,
      /#(\d{4,})/,
      /\b(\d{4,6})\b/
    ];
    
    for (const pattern of orderPatterns) {
      const match = emailBody.match(pattern);
      if (match) {
        return match[1];
      }
    }
    
    return null;
  }
  
  /**
   * REMOVED: Legacy template system completely deleted per user requirements  
   * Generate low confidence response suggesting escalation to human
   */
  private async generateLegacyResponse(rule: any, emailData: { subject: string; body: string; fromEmail: string }, userId: string): Promise<{ response: string; adjustedConfidence: number }> {
    console.log('[AUTO_RESPONDER] Legacy fallback triggered - generating low confidence escalation response');
    
    // Generate simple escalation notice instead of placeholder templates
    const escalationResponse = `Hello!

Thank you for contacting us. Your inquiry requires specialized assistance that our AI agent cannot provide at this time.

A human team member will review your message and respond within 24 hours to ensure you receive the most accurate and helpful information.

We appreciate your patience.

Best regards,
Customer Support Team

This email was sent by a robot. We use AI to solve your problems as quickly as possible. Reply 'Human' anytime and a human will jump in.`;

    return {
      response: escalationResponse,
      adjustedConfidence: 15 // Very low confidence to ensure human review
    };
  }

  /**
   * Calculate confidence score adjusted for customer sentiment
   * High negative sentiment reduces confidence, indicating need for human review
   */
  private async calculateSentimentAwareConfidence(baseConfidence: number, emailData: { subject: string; body: string; fromEmail: string }, userId: string): Promise<number> {
    try {
      const { sentimentAnalysisService } = await import('./sentiment-analysis');
      const sentimentResult = await sentimentAnalysisService.analyzeSentiment(emailData.body);
      
      let confidenceAdjustment = 0;
      const negativeScore = sentimentResult.scores.negative || 0;
      const sentimentConfidence = sentimentResult.confidence || 0;
      
      // Reduce confidence for high negative sentiment (more human review needed)
      if (sentimentResult.sentiment === 'NEGATIVE') {
        if (negativeScore > 75 && sentimentConfidence > 90) {
          confidenceAdjustment = -25; // Significant reduction for very angry customers
        } else if (negativeScore > 60 && sentimentConfidence > 80) {
          confidenceAdjustment = -15; // Moderate reduction for frustrated customers
        } else if (negativeScore > 45 && sentimentConfidence > 70) {
          confidenceAdjustment = -8; // Small reduction for mildly negative sentiment
        }
      }
      
      // Boost confidence for positive sentiment (AI handles well)
      if (sentimentResult.sentiment === 'POSITIVE' && sentimentConfidence > 80) {
        confidenceAdjustment = 5; // Small boost for happy customers
      }
      
      // Apply adjustment and ensure bounds
      const adjustedConfidence = Math.max(10, Math.min(95, baseConfidence + confidenceAdjustment));
      
      return Math.round(adjustedConfidence);
    } catch (error) {
      console.error('Failed to analyze sentiment for confidence adjustment:', error);
      return baseConfidence; // Return original confidence if sentiment analysis fails
    }
  }

  private isValidEmailForProduction(email: string): boolean {
    // Block test/demo/invalid email patterns that damage sender reputation
    const blockedPatterns = [
      /^test/i,
      /^demo/i,
      /example\.com$/i,
      /test\.com$/i,
      /\.test$/i,
      /user\d+/i,
      /demo_/i,
      /\+test/i,
      /noreply/i,
      /donotreply/i
    ];
    
    return !blockedPatterns.some(pattern => pattern.test(email));
  }

  /**
   * Send empathetic auto-response immediately (for non-approval flow)
   */
  async sendEmpathicAutoResponse(userId: string, customerEmail: string, responseContent: string, originalSubject: string): Promise<boolean> {
    try {
      // CRITICAL: Validate email before sending to protect sender reputation
      if (!this.isValidEmailForProduction(customerEmail)) {
        console.warn(`AutoResponder: Blocked email send to protect sender reputation - ${customerEmail}`);
        return false;
      }

      // CRITICAL: Validate content safety before sending
      const safetyValidation = await contentSafetyService.validateResponse(responseContent, userId);
      
      if (!safetyValidation.approved) {
        console.warn(`AutoResponder: Blocked response due to safety validation - ${safetyValidation.blockReason}`);
        return false;
      }

      // Create response subject
      let responseSubject = `Re: ${originalSubject}`;
      if (!originalSubject.toLowerCase().startsWith('re:')) {
        responseSubject = `Re: ${originalSubject}`;
      }

      const success = await emailRoutingService.sendEmail(userId, {
        to: customerEmail,
        subject: responseSubject,
        html: responseContent,
      });

      return success;
    } catch (error) {
      console.error('Empathetic auto-response sending error:', error);
      return false;
    }
  }
  
  /**
   * DEPRECATED: Legacy auto-response system (keeping for backward compatibility)
   */
  async sendAutoResponse(userId: string, customerEmail: string, rule: any, originalSubject: string, originalBody?: string): Promise<boolean> {
    try {
      // CRITICAL: Validate email before sending to protect sender reputation
      if (!this.isValidEmailForProduction(customerEmail)) {
        console.warn(`AutoResponder: Blocked email send to protect sender reputation - ${customerEmail}`);
        return false;
      }

      // Generate knowledge-grounded response if original body provided
      let responseTemplate = rule.template;
      if (originalBody) {
        try {
          const groundedResponse = await hallucinationPreventionService.generateGroundedResponse(
            originalBody,
            rule.classification,
            userId
          );
          
          // Use grounded response if available and validated, otherwise fallback to template
          if (groundedResponse && groundedResponse.trim()) {
            responseTemplate = groundedResponse;
          }
        } catch (groundingError) {
          console.warn('Knowledge grounding failed, using template fallback:', groundingError);
          // Continue with template fallback
        }
      }

      // CRITICAL: Validate content safety and brand voice before sending
      const safetyValidation = await contentSafetyService.validateResponse(responseTemplate, userId);
      
      if (!safetyValidation.approved) {
        console.warn(`AutoResponder: Blocked response due to safety validation - ${safetyValidation.blockReason}`);
        return false;
      }

      const settings = await storage.getSystemSettings(userId);
      const fromAddress = settings?.fromEmail || 'support@humanfoodbar.com';
      const replyToAddress = settings?.replyToEmail || fromAddress;

      // Create response subject
      let responseSubject = `Re: ${originalSubject}`;
      if (!originalSubject.toLowerCase().startsWith('re:')) {
        responseSubject = `Re: ${originalSubject}`;
      }

      const success = await emailRoutingService.sendEmail(userId, {
        to: customerEmail,
        subject: responseSubject,
        html: responseTemplate,
      });

      return success;
    } catch (error) {
      console.error('Auto-response sending error:', error);
      return false;
    }
  }

  /**
   * Escalate email to human review
   */
  async escalateEmail(emailId: string, userId: string, classification: ClassificationResult, reason?: string): Promise<ProcessedEmail> {
    const escalationReason = reason || `Low confidence classification (${classification.confidence}%) or complex inquiry requiring human review`;
    
    // Determine priority from AI classification or fallback to confidence-based
    let priority = 'medium';
    if ('priority' in classification && classification.priority) {
      priority = classification.priority;
    } else {
      // Fallback: confidence-based priority
      priority = classification.confidence < 40 ? 'high' : 'medium';
    }
    
    // Create escalation entry
    const { nanoid } = await import('nanoid');
    await storage.createEscalationQueue({
      id: nanoid(),
      emailId,
      userId,
      priority: priority as 'low' | 'medium' | 'high' | 'urgent',
      reason: escalationReason,
      status: 'pending'
    });

    // Update email status
    await storage.updateEmail(emailId, {
      status: 'escalated',
      escalationReason: escalationReason,
      processedAt: new Date()
    });

    // Log escalation activity
    await storage.createActivityLog({
      userId,
      action: 'Escalated to human',
      type: 'escalation',
      executedBy: 'ai',
      customerEmail: 'system', // Will be updated with actual customer email
      details: `Email escalated: ${escalationReason}`,
      status: 'pending',
      metadata: {
        classification: classification.classification,
        confidence: classification.confidence,
        reason: escalationReason
      }
    });

    return {
      id: emailId,
      classification: classification.classification,
      confidence: classification.confidence,
      autoResponseSent: false,
      escalated: true
    };
  }

  /**
   * Process manual response (used by Quick Actions)
   */
  async processManualResponse(userId: string, customerEmail: string, action: string, template: string, metadata: any = {}): Promise<boolean> {
    try {
      const settings = await storage.getSystemSettings(userId);
      const fromAddress = settings?.fromEmail || 'support@humanfoodbar.com';
      const replyToAddress = settings?.replyToEmail || fromAddress;

      // Determine subject based on action type
      let subject = 'Customer Service Update';
      switch (action) {
        case 'sent_order_info':
          subject = metadata.orderNumber ? `Order Update: ${metadata.orderNumber}` : 'Order Information';
          break;
        case 'processed_refund':
          subject = metadata.orderNumber ? `Refund Processed: Order ${metadata.orderNumber}` : 'Refund Confirmation';
          break;
        case 'updated_subscription':
          subject = 'Subscription Update Confirmation';
          break;
        default:
          subject = 'Customer Service Response';
      }

      const success = await emailRoutingService.sendEmail(userId, {
        to: customerEmail,
        subject: subject,
        html: template,
      });

      return success;
    } catch (error) {
      console.error('Manual response sending error:', error);
      return false;
    }
  }

  /**
   * Get processing statistics for dashboard
   */
  async getProcessingStats(userId: string, timeframe: 'today' | 'week' | 'month' = 'today') {
    const timeMap = {
      today: 1,
      week: 7,
      month: 30
    };
    
    const days = timeMap[timeframe];
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    startDate.setHours(0, 0, 0, 0);

    // Get activity logs for the timeframe
    const activities = await storage.getActivityLogs(userId);
    const recentActivities = activities.filter(activity => 
      activity.createdAt && new Date(activity.createdAt) >= startDate
    );

    const autoResponses = recentActivities.filter(a => a.action === 'Sent automated reply').length;
    const manualResponses = recentActivities.filter(a => a.executedBy === 'human').length;
    const escalations = recentActivities.filter(a => a.type === 'escalation').length;
    const total = autoResponses + manualResponses;

    return {
      totalProcessed: total,
      autoResponses,
      manualResponses,
      escalations,
      automationRate: total > 0 ? Math.round((autoResponses / total) * 100) : 0,
      timeframe
    };
  }

  /**
   * Extract order number from email content using regex patterns
   */
  extractOrderNumberFromEmail(subject: string, body: string): string | null {
    try {
      const content = `${subject} ${body}`;
      
      // Common order number patterns
      const patterns = [
        /#(\d{4,})/i,                    // #12345
        /order\s*#?(\d{4,})/i,          // order 12345, order #12345
        /order\s*number\s*#?(\d{4,})/i, // order number 12345
        /ord[er]*-(\d{4,})/i,           // ORD-12345
        /\b(\d{5,})\b/                  // Any 5+ digit number
      ];
      
      for (const pattern of patterns) {
        const match = content.match(pattern);
        if (match) {
          return match[1];
        }
      }
      
      return null;
    } catch (error) {
      console.error('Error extracting order number:', error);
      return null;
    }
  }
}

export const autoResponderService = new AutoResponderService();