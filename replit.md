# OptiRota

## Overview
OptiRota is a micro-SaaS Progressive Web App (PWA) designed for autonomous delivery drivers in Brazil. It streamlines logistics and financial management by enabling drivers to plan and track delivery routes, and automatically calculate earnings. The application aims to provide a robust, offline-first solution to enhance efficiency and financial transparency for delivery professionals.

Key capabilities include:
- Multi-tenant SaaS architecture with a 16-day free trial.
- Route planning using Nominatim geocoding and OSRM routing.
- Real-time delivery tracking with status management and manual route adjustments.
- Automatic earnings calculation based on configurable settings and Sunday bonuses.
- Integration with popular navigation apps like Waze and Google Maps.
- Full offline functionality with an IndexedDB-based sync queue and offline map tile support.
- Custom authentication system and a dedicated admin panel for subscription management.

## User Preferences
Preferred communication style: Simple, everyday language (Portuguese - Brazil).

## System Architecture

### Core Design Principles
- **Offline-First**: The application is designed to function fully offline, syncing data with the backend when an internet connection is available.
- **PWA**: Utilizes Progressive Web App features for installability, offline access, and an app-like experience.
- **Multi-tenancy**: Supports multiple accounts, each with their own data and configurable settings.

### Frontend
- **Framework**: React 19 with TypeScript.
- **Routing**: Wouter.
- **State Management**: Zustand for client-side state, TanStack React Query for server state.
- **UI**: Shadcn/ui (built on Radix UI) and Tailwind CSS for styling, supporting light/dark modes.
- **Mapping**: Leaflet + OpenStreetMap for visualization, Nominatim for geocoding, OSRM for routing.
- **Offline Features**: Wake Lock API to keep the screen active during deliveries, IndexedDB for local storage, and custom service worker for caching strategies (Network First, Cache First, Stale While Revalidate). Offline map tiles are supported for specific cities.

### Backend
- **Framework**: Express.js 5 with TypeScript.
- **API**: RESTful endpoints.
- **Authentication**: Custom, session-based authentication with bcrypt hashing and 30-day persistent login.
- **Build System**: Vite for development, esbuild for production.

### Data Management
- **Database**: Supabase (PostgreSQL).
- **ORM**: Direct Supabase JS client queries.
- **Schema**: `db.sql` defines the complete database schema.
- **Offline Sync**: A `sync_queue` table and client-side IndexedDB manage pending operations for eventual synchronization with Supabase.

### Business Logic
- **Subscription/Trial**: 16-day free trial; financial data is blocked after expiration until subscription payment.
- **Earnings Configuration**: Per-account configurable settings for `earningPerDelivery`, `sundayBonusThreshold`, and `sundayBonusValue`.
- **Admin System**: Separate admin panel for user and subscription management.

### Project Structure
Organized into `client/` (frontend), `server/` (backend), and `shared/` (common types and schemas).

## External Dependencies
- **Supabase**: Backend-as-a-Service for PostgreSQL database, authentication (not Supabase Auth), and storage.
- **Google Maps Platform**: Provides all mapping functionality:
  - **Maps JavaScript API**: Map visualization with AdvancedMarkerElement
  - **Geocoding API**: Address to coordinates conversion
  - **Directions API**: Route optimization and navigation
- **Waze / Google Maps**: External navigation applications integrated for turn-by-turn directions.
- **Stripe Pix**: Payment gateway for subscription management, specifically for Brazilian Pix payments.

## Environment Variables
- **GOOGLE_MAPS_API_KEY**: Server-side Google Maps API key for Geocoding and Directions APIs
- **VITE_GOOGLE_MAPS_API_KEY**: Client-side Google Maps API key for Maps JavaScript API