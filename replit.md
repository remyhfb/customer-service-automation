# Customer Service Email Automation System

## Overview
"Delight Desk Agent" is a full-stack customer service automation system designed for e-commerce businesses, specifically integrating with WooCommerce. It aims to streamline customer support through reactive Quick Actions, AI-powered auto-responders, and comprehensive order management. The system's primary purpose is to provide an AI agent that can either fully manage customer service or significantly augment a single human agent's capacity, targeting businesses with 0-1 dedicated customer service representatives. The vision is to enhance efficiency, reduce response times, and improve customer satisfaction.

## User Preferences
Preferred communication style: Simple, everyday language.
UI Design: Prioritize speed and efficiency - minimal clicks, minimal fields, maximum automation.
Quick Actions: One-click actions with minimal user input - no unnecessary fields or features.
Visual Hierarchy: Avoid over-nesting cards or containers. Keep related information at the same visual level for easier consumption. Simpler layouts are preferred over complex nested structures.
Single User System: The system is designed for single-user operation targeting businesses with 0-1 full-time customer service representatives. No user assignment, ticket routing, or multi-user functionality should be implemented. Companies needing these features are outside our ICP and should use traditional helpdesk solutions.
Individual Agent Controls: The system uses individual agent-based toggles (WISMO, Subscription, Returns, etc.) without a master automations switch. This simplified architecture eliminates UX complexity and potential liability issues. Each agent can be enabled/disabled independently through their respective configuration pages.
AI Agent Branding: The system is consistently branded as the "Delight Desk Agent" using clear "AI agent" terminology throughout the interface. This replaces generic "AI" references to position the product as a dedicated AI agent solution that customers can understand and trust. Note: In the rapid resolution engine, "AI assistant" terminology is used to distinguish between AI that executes actions (agents) versus AI that provides suggestions (assitants).
Email Routing: CRITICAL DISTINCTION - Two separate email systems:
1. Customer-to-Customer emails: Use OAuth (Gmail/Outlook) - our customers email their customers through their own connected accounts (order updates, AI assistant responses, customer service replies)
2. DelightDesk-to-Customer emails: Use SendGrid exclusively - all communications from DelightDesk to our customers (weekly reports, onboarding emails, system notifications, billing notifications, trial reminders)

FATAL ERROR PREVENTION: Never mix these systems. Customer order updates MUST use the customer's connected Gmail/Outlook account, NOT SendGrid. SendGrid is only for DelightDesk's own system emails to customers.

AI Agent Email Unification: ALL AI agents now use the unified email routing service for customer communications. This includes WISMO agents, subscription agents, returns agents, order cancellation agents, auto-responder service, escalation queue responses, Quick Actions, and email processor. All customer-facing emails are sent through the customer's connected Gmail/Microsoft account using the same minimalist email template for consistency.
Email Template Testing: MANDATORY PROCESS - Always send test email immediately after any email template changes. User needs to verify visual changes, never make template changes without sending test email.
Email Template Change Checklist: CRITICAL PROCESS - When making email template changes:
1. Make code changes
2. Verify changes are saved in file (view exact lines)
3. Clear any potential caching issues (restart server/rebuild if needed)
4. Send test email
5. Verify changes appear in actual received email
Email Reputation Protection: CRITICAL SAFEGUARDS - All email services include comprehensive validation to prevent sends to test/demo/invalid addresses that damage sender reputation. Email schedulers are disabled by default and require explicit environment variable `ENABLE_EMAIL_SCHEDULERS=true` to activate.
Content Safety by Default: MANDATORY INTEGRATION - All AI-generated content MUST pass through OpenAI content safety validation before being sent to customers. This is implemented centrally in EmailRoutingService and covers all agents automatically. No exceptions - every email, response, and communication must be validated for safety, brand voice consistency, and sentiment appropriateness.
Activity Logging by Default: COMPREHENSIVE TRACKING - All AI agent actions MUST be logged through storage.createActivityLog for complete audit trails. This includes email sends, AI assistant suggestions, promo code offers, order cancellations, and all customer interactions. Standard activity log schema enforced across all services with proper metadata tracking for analytics and compliance.
Pricing Content Consistency: All pricing-related pages use dynamic plan fetching with consistent price-based sorting (ascending). Eliminated multiple hardcoded pricing blocks to prevent maintenance issues. All pricing displays now fetch from `/api/billing/plans` and sort by `parseFloat(price)` for uniform plan ordering: Solopreneur ($9) → Growth ($45) → Scale ($80).
API Usage Limits: AfterShip API limited by total automations paid for (monthly only, no daily limits). OpenAI API completely unlimited on all plans (usage tracking only).
Billing Interface Standards: Professional attention to detail required - remove redundant buttons, eliminate confusing UI elements, ensure proper capitalization (use displayName for plan names), implement smart button logic based on subscription status, and provide prominent CTAs for trial users.
Navigation Organization: Sidebar uses modern SaaS design pattern with primary navigation for frequently used features (Dashboard, Rapid Resolution, Quick Actions, AI Automations, Order Cancellations, Approval Queue) and collapsible "Settings & More" dropdown for setup/admin tools (WISMO Widget, AI Training, Activity Log, Connections).
Admin Panel Organization: Simple flat tab navigation for admin panel sections (Analytics, System Emails, Onboarding, Reports, Tests, Users) for easy access and clear organization.
Layout Pattern: CRITICAL - All pages using Layout component MUST include the container structure `max-w-6xl mx-auto p-6 space-y-6` to ensure proper spacing from sidebar. This pattern is consistently used across all pages to prevent sidebar spacing issues that occur when building new pages.
AI Agent Synchronization: CRITICAL - All AI agent toggles use centralized API endpoints with proper cache invalidation across pages. Dashboard uses `/api/agents/${user?.id}/overview` and `/api/agents/${agentId}/${user?.id}/toggle` with cross-page cache invalidation to ensure state synchronization between dashboard, AI agents overview (/ai-agents), and individual agent configuration pages. Agent cards on dashboard removed descriptions for cleaner interface.
Product Agent: NEW - Added Product Agent with "product" classification for handling product and brand-related questions based exclusively on training data. Supports full automation like other agents with enable/disable and moderation controls. Classifications include product features, specifications, compatibility, usage instructions, and brand inquiries. Routes with 80-95% confidence and low priority for product information requests.
Sentiment Analysis Integration: MAJOR IMPROVEMENT - Integrated Amazon Comprehend sentiment analysis into all email processing pipelines. Now detects highly negative sentiment (>75% negative with >90% confidence or >85% negative with >80% confidence) and immediately escalates angry customers to humans before any automated responses. Applied to email-processor.ts, auto-responder.ts, and gmail-push.ts for comprehensive coverage across initial processing, real-time processing, and OAuth-triggered processing. This prevents frustrated customers from receiving automated responses and ensures immediate human intervention for reputation protection.
Email Processing Pipelines: COMPREHENSIVE ARCHITECTURE - Three parallel email processing systems ensure 100% email coverage: (1) Real-time Gmail Push via webhook for instant processing, (2) OAuth-triggered processing during user login for catch-up processing, (3) Manual email processor for on-demand processing and fallback. All pipelines follow the same five-step standardized process with thread context linking, AI classification, sentiment analysis, agent routing, and response generation. Confidence-based routing ensures emails below 60% confidence are escalated to humans, while approval queue integration allows human oversight of all automated responses.

## System Architecture

### Backend
- **Framework**: Express.js with TypeScript
- **Database**: PostgreSQL with Drizzle ORM
- **Authentication**: Session-based with OAuth
- **API Design**: RESTful
- **Email Processing**: Multi-pipeline architecture with real-time Gmail Push, OAuth-triggered processing, and manual processing fallback. All pipelines follow a five-step standardized process: ingestion → AI classification → sentiment analysis → agent routing → response generation. A thread context system maintains conversation continuity.
- **Order Lookup**: Integrated with WooCommerce for order, customer, subscription data, tracking, and refund processing.
- **Security**: Route-level authentication, admin access control, rate limiting, input validation, Sentry integration, security headers, XSS protection, and performance optimization.
- **Session Persistence**: PostgreSQL session store provides 7-day rolling persistence.
- **AI Guard Rails**: Amazon Comprehend is used for sentiment analysis and contextual blocking.
- **Payment Processing**: Exclusively Stripe live mode.
- **Deployment Health Checks**: Fast `/health` endpoint with optimized middleware and background initialization for rapid responses.

### Frontend
- **Framework**: React with TypeScript
- **Routing**: Wouter
- **State Management**: TanStack Query
- **UI Components**: Radix UI with shadcn/ui styling
- **Styling**: Tailwind CSS with CSS variables, employing a Stripe-inspired aesthetic.
- **Form Handling**: React Hook Form with Zod validation.
- **UI/UX Decisions**: Clean, minimalist, and efficient design with a single-screen dashboard. Mobile-first approach with mobile-optimized email templates.
- **Timeline Layouts**: Superhuman-style vertical timelines.

### Build System
- **Development**: Vite
- **Production**: ESBuild (backend), Vite (frontend)
- **TypeScript**: Strict type checking.

### Key Features
- AI-powered Email Classification
- Comprehensive Thread Context System
- Reactive Automation Rules
- Quick Actions Module
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
- Strategic positioning as "Email AI Specialist"
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