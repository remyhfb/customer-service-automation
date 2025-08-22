# Customer Service Email Automation System

## Overview
"Delight Desk Agent" is a full-stack customer service automation system designed for e-commerce businesses using WooCommerce. Its primary purpose is to streamline customer support through reactive Quick Actions, AI-powered auto-responders, and comprehensive order management. The system aims to significantly enhance efficiency, reduce response times, and improve customer satisfaction by either fully managing customer service or augmenting a single human agent's capacity. It targets small e-commerce businesses (0-1 dedicated customer service representatives) as an "Email AI Specialist," offering a solution for low ticket volumes (50-200 emails/month).

## User Preferences
Preferred communication style: Simple, everyday language.
UI Design: Prioritize speed and efficiency - minimal clicks, minimal fields, maximum automation.
Quick Actions: One-click actions with minimal user input - no unnecessary fields or features.
Visual Hierarchy: Avoid over-nesting cards or containers. Keep related information at the same visual level for easier consumption. Simpler layouts are preferred over complex nested structures.
Single User System: The system is designed for single-user operation targeting businesses with 0-1 full-time customer service representatives. No user assignment, ticket routing, or multi-user functionality should be implemented.
Individual Agent Controls: The system uses individual agent-based toggles (WISMO, Subscription, Returns, etc.) without a master automations switch. Each agent can be enabled/disabled independently through their respective configuration pages.
AI Agent Branding: The system is consistently branded as the "Delight Desk Agent" using clear "AI agent" terminology throughout the interface. Note: In the rapid resolution engine, "AI assistant" terminology is used to distinguish between AI that executes actions (agents) versus AI that provides suggestions (assistants).
Target Market Focus: Small e-commerce businesses (0-1 customer service reps) with low ticket volumes (50-200 emails/month). Focus on training data quality, template improvements, and simple optimizations.
Email Routing: Two separate email systems: 1. Customer-to-Customer emails: Use OAuth (Gmail/Outlook) - our customers email their customers through their own connected accounts. 2. DelightDesk-to-Customer emails: Use SendGrid exclusively - all communications from DelightDesk to our customers. Never mix these systems.
AI Agent Email Unification: ALL AI agents now use the unified email routing service for customer communications. All customer-facing emails are sent through the customer's connected Gmail/Microsoft account using the same minimalist email template for consistency.
Intent-Based AI Classification: All AI agents and classifiers upgraded from primitive keyword-based pattern matching to sophisticated natural language understanding using GPT-4o with industry-standard implementations.
Enterprise-Grade Hallucination Prevention: Implemented robust two-phase hallucination prevention system with INDUSTRY-STANDARD thresholds and research-backed implementations. Phase 1 includes ML confidence thresholds (50%/70%/80%) based on business standards. Phase 2 implements knowledge grounding using RAG (Retrieval-Augmented Generation) with VECTOR EMBEDDINGS using OpenAI best practices (0.70-0.75 similarity thresholds). CRITICAL ENFORCEMENT: AI ALWAYS prioritizes available training data and uses research-calibrated confidence levels.
Industry-Standard AI Implementation: COMPREHENSIVE UPGRADE - All AI systems now follow established industry best practices instead of improvised implementations. Vector embeddings use 0.70 threshold (OpenAI RAG standards), ML confidence follows research guidelines (80% high-stakes, 70% business standard, 50% ML default), and sentiment analysis uses Microsoft Dynamics 365 calibrated thresholds (75% high-risk, 60% medium-risk) with context-based adjustments.
Email Template Testing: MANDATORY PROCESS - Always send test email immediately after any email template changes. User needs to verify visual changes, never make template changes without sending test email.
Email Template Change Checklist: CRITICAL PROCESS - When making email template changes: 1. Make code changes. 2. Verify changes are saved in file. 3. Clear any potential caching issues. 4. Send test email. 5. Verify changes appear in actual received email.
Email Reputation Protection: CRITICAL SAFEGUARDS - All email services include comprehensive validation to prevent sends to test/demo/invalid addresses. Email schedulers are disabled by default and require explicit environment variable `ENABLE_EMAIL_SCHEDULERS=true` to activate.
Content Safety by Default: MANDATORY INTEGRATION - All AI-generated content MUST pass through OpenAI content safety validation before being sent to customers.
Activity Logging by Default: COMPREHENSIVE TRACKING - All AI agent actions MUST be logged through storage.createActivityLog for complete audit trails.
Pricing Content Consistency: All pricing-related pages use dynamic plan fetching with consistent price-based sorting (ascending). All pricing displays now fetch from `/api/billing/plans` and sort by `parseFloat(price)`.
API Usage Limits: AfterShip API limited by total automations paid for (monthly only). OpenAI API completely unlimited on all plans.
Billing Interface Standards: Remove redundant buttons, eliminate confusing UI elements, ensure proper capitalization (use displayName for plan names), implement smart button logic based on subscription status, and provide prominent CTAs for trial users.
Navigation Organization: Sidebar uses modern SaaS design pattern with primary navigation for frequently used features and a collapsible "Settings & More" dropdown for setup/admin tools. AI Training moved to primary navigation for easy access.
Admin Panel Organization: Simple flat tab navigation for admin panel sections (Analytics, System Emails, Onboarding, Reports, Tests, Users) for easy access and clear organization.
Layout Pattern: CRITICAL - All pages using Layout component MUST include the container structure `max-w-6xl mx-auto p-6 space-y-6`.
AI Agent Synchronization: CRITICAL - All AI agent toggles use centralized API endpoints with proper cache invalidation across pages. Dashboard uses `/api/agents/${user?.id}/overview` and `/api/agents/${agentId}/${user?.id}/toggle` with cross-page cache invalidation to ensure state synchronization.
Product Agent: NEW - Added Product Agent with "product" classification for handling product and brand-related questions based exclusively on training data.
AI Agent Name Suggestions: INTELLIGENT SYSTEM - Implemented content quality threshold system with GPT-4o powered name suggestions. Users must have at least 500 words of brand content before AI suggestions are enabled.
AI Agent Email Signatures: COMPREHENSIVE SYSTEM - Built automated AI agent signature system that generates both text and HTML signatures using personalized agent names and configurable salutations. All AI agents automatically include professional signatures in customer emails. Users can choose from research-backed salutation options including "Best regards," "Thank you," "Sincerely," "Cheers," and others to match their brand tone.
AI Agent Naming: CULTURALLY DIVERSE UPGRADE - Replaced branded robot character names (WALL-E, R2-D2, C-3PO) with culturally diverse, professional assistant names (Kai, Maya, Zara, Noor, Alex, Sam, Rio, Aria, Kaia, Nia, Sage, Nova) to avoid brand confusion, support global businesses, and maintain professional customer service tone across different cultural contexts.
Sentiment Analysis Integration: INDUSTRY-STANDARD IMPLEMENTATION - Integrated Amazon Comprehend sentiment analysis with Microsoft Dynamics 365 calibrated thresholds. Uses research-based risk assessment: 75% high-risk threshold (Microsoft "Slightly negative" standard), 60% medium-risk with context adjustments for VIP customers (-15%), long threads (-10%), and billing issues (-10%). Conservative approach minimizes false positives while ensuring proper escalation.
Email Processing Pipelines: Three parallel email processing systems: (1) Real-time Gmail Push, (2) OAuth-triggered processing during user login, (3) Manual email processor. All pipelines follow the same five-step standardized process with thread context linking, AI classification, sentiment analysis, agent routing, and response generation.
Empathetic Response System: REVOLUTIONARY UPGRADE - Replaced rigid templated responses with dynamic GPT-4o powered empathetic response generation. All AI agents now analyze customer emotional state and generate contextually appropriate responses.
AI Team Center Interface: MAJOR UX UPGRADE - Completely rebuilt the AI Training page into a clean, modern "AI Team Center" with proper navigation hierarchy. Renamed from "training" to reflect investment mindset - users now "build and invest in their AI agent" rather than just "train AI." Features organized sections: AI Knowledge, AI Identity, Voice & Settings, AI Performance. Dramatically improved accessibility and user experience while maintaining all existing functionality.

## System Architecture

### Backend
- **Framework**: Express.js with TypeScript
- **Database**: PostgreSQL with Drizzle ORM
- **Authentication**: Session-based with OAuth
- **API Design**: RESTful
- **Email Processing**: Multi-pipeline architecture (real-time Gmail Push, OAuth-triggered, manual fallback) following a 5-step process: ingestion → AI classification → sentiment analysis → agent routing → response generation. Includes thread context for continuity.
- **Order Lookup**: Integrated with WooCommerce for order, customer, subscription data, tracking, and refund processing.
- **Security**: Route-level authentication, admin access control, rate limiting, input validation, Sentry integration, security headers, XSS protection, and performance optimization.
- **Session Persistence**: PostgreSQL session store (7-day rolling persistence).
- **AI Guard Rails**: Amazon Comprehend with industry-standard sentiment thresholds, research-based confidence levels, and enterprise-grade hallucination prevention.
- **Payment Processing**: Exclusively Stripe live mode.
- **Deployment Health Checks**: Fast `/health` endpoint with optimized middleware.

### Frontend
- **Framework**: React with TypeScript
- **Routing**: Wouter
- **State Management**: TanStack Query
- **UI Components**: Radix UI with shadcn/ui styling
- **Styling**: Tailwind CSS with CSS variables, Stripe-inspired aesthetic.
- **Form Handling**: React Hook Form with Zod validation.
- **UI/UX Decisions**: Clean, minimalist, efficient single-screen dashboard. Mobile-first design with optimized email templates.
- **Timeline Layouts**: Superhuman-style vertical timelines.

### Build System
- **Development**: Vite
- **Production**: ESBuild (backend), Vite (frontend)
- **TypeScript**: Strict type checking.

### Key Features
- AI-powered Email Classification with Industry-Standard Vector Embeddings (0.70 threshold, OpenAI best practices)
- Comprehensive Thread Context System
- Reactive Automation Rules & Quick Actions Module
- Smart Lookup (orders, subscriptions, customers)
- Comprehensive Analytics Dashboard
- User Authentication and Admin Panel
- Approval Queue for human oversight
- Two-Way Email Inbox Synchronization
- Professional Web Scraping System for AI training
- AI Assistant Integration (suggestions with confidence levels)
- Onboarding Drip System and Weekly Report System
- Minimalist Email Templating
- Cost Optimization for OpenAI API calls
- WooCommerce Integration Logging
- Robust Subscription Conversion Flow and Date Handling
- Two-Tier Usage Notification System for API limits
- Manual Rejection Analytics System
- ShipBob OAuth Integration for automated order cancellation.
- Real-time Gmail Push Notification System via Google Cloud Pub/Sub.

## External Dependencies

### Email Providers
- **Gmail**: OAuth integration
- **Microsoft Outlook 365**: Microsoft Graph API v1.0
- **SendGrid**: For DelightDesk-to-customer emails

### E-commerce Platforms
- **WooCommerce**: REST API

### AI/ML Services
- **OpenAI**: GPT-4o
- **AfterShip**: AI delivery predictions, tracking data
- **Amazon Comprehend**: Real-time sentiment analysis

### Authentication
- **Google OAuth**
- **Microsoft Graph OAuth**

### Infrastructure
- **Neon Database**: Serverless PostgreSQL
- **Sentry**: Error monitoring
- **Stripe**: Payment processing
- **Google Cloud Pub/Sub**: For real-time Gmail push notifications