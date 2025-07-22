# README.md (Setup Instructions)

# LMS AI Assistant - Production-Ready System

A comprehensive, secure, and production-ready AI-powered assistant for Learning Management Systems with advanced device validation, encryption, and admin management capabilities.

## Features

### Core Functionality
- **Intelligent AI Assistant**: Interactive chat interface with context-aware responses
- **Content Analysis**: Automatic summarization and explanation of course materials
- **Smart Q&A**: Real-time answers about assignments, quizzes, and course content
- **Note Taking**: Automated note generation and organization
- **Quick Actions**: One-click summarize, explain, quiz, and note-taking features

### Security & Device Management
- **Advanced Device Validation**: Hardware ID and browser fingerprinting
- **AES Encryption**: Unique encryption keys per device with Japanese character support
- **Admin Approval Workflow**: Pending → Admin Review → Active/Blocked status
- **Secure Script Delivery**: Encrypted script storage and delivery
- **Multi-Device Support**: Configurable device limits per user

### Admin Panel
- **Real-time Dashboard**: System health, usage analytics, and statistics
- **Pending Requests Management**: Approve/deny device requests with notes
- **Script Management**: Upload, encrypt, and manage AI script versions
- **System Settings**: Configure passwords, device limits, and security options
- **Activity Logs**: Comprehensive logging and monitoring

### Technical Excellence
- **Production-Ready**: Full error handling, logging, and monitoring
- **Scalable Architecture**: Netlify Functions + Supabase backend
- **Enterprise Security**: JWT tokens, rate limiting, CORS protection
- **Responsive Design**: Works on desktop and mobile devices
- **Multi-Language**: UTF-8 support including Japanese characters

## Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Frontend      │    │   Netlify        │    │   Supabase      │
│   (HTML/JS)     │◄──►│   Functions      │◄──►│   Database      │
│                 │    │   (Node.js)      │    │   (PostgreSQL)  │
└─────────────────┘    └──────────────────┘    └─────────────────┘
         ▲                       ▲                       ▲
         │                       │                       │
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Userscript    │    │   Admin Panel    │    │   Encryption    │
│   (Loader)      │    │   (Management)   │    │   (AES-256)     │
└─────────────────┘    └──────────────────┘    └─────────────────┘
```

## Quick Start

### 1. Prerequisites

- **Node.js 18+** and npm 9+
- **Supabase Account** (free tier works)
- **Netlify Account** (free tier works)
- **Git** for version control

### 2. Supabase Setup

1. **Create a new Supabase project**:
   - Go to [supabase.com](https://supabase.com)
   - Create new project
   - Note your project URL and service role key

2. **Run the database migration**:
   ```sql
   -- Copy and paste the contents of supabase/migrations/001_initial_schema.sql
   -- into your Supabase SQL Editor and run it
   ```

3. **Configure Row Level Security**:
   - The migration script automatically sets up RLS policies
   - Verify in Supabase Dashboard → Authentication → Policies

### 3. Environment Configuration

1. **Copy environment template**:
   ```bash
   cp .env.example .env
   ```

2. **Fill in your values**:
   ```env
   # Supabase Configuration
   SUPABASE_URL=https://your-project.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here
   
   # Security Configuration
   JWT_SECRET=your_jwt_secret_key_here_minimum_32_characters
   SITE_PASSWORD=wrongnumber
   ADMIN_PASSWORD=manakamana12
   
   # Admin Configuration
   ADMIN_EMAIL=your_admin_email@example.com
   SECRET_KEYWORD=admin
   ```

### 4. Local Development

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Start development server**:
   ```bash
   npm run dev
   ```

3. **Access locally**:
   - Frontend: `http://localhost:8888`
   - Admin Panel: `http://localhost:8888/admin`
   - Functions: `http://localhost:8888/.netlify/functions/`

### 5. Netlify Deployment

1. **Connect to Netlify**:
   - Push code to GitHub
   - Connect repository in Netlify Dashboard
   - Or use Netlify CLI: `npm run deploy:prod`

2. **Configure Environment Variables**:
   - Go to Netlify Dashboard → Site Settings → Environment Variables
   - Add all variables from your `.env` file

3. **Deploy**:
   - Automatic deployment on git push
   - Manual: `npm run deploy:prod`

## Usage Guide

### For End Users

1. **Download Loader Script**:
   - Visit `https://your-site.netlify.app`
   - Enter username and site password
   - Download `loader-USERNAME.user.js`

2. **Install Userscript**:
   - Install Tampermonkey or ScriptCat browser extension
   - Open downloaded script file
   - Click "Install" in the extension

3. **Use AI Assistant**:
   - Navigate to your LMS (king-lms.kcg.edu/ultra/*)
   - Click the floating AI button
   - Interact with the AI assistant

### For Administrators

1. **Access Admin Panel**:
   - Visit `https://your-site.netlify.app/admin`
   - Login with admin password

2. **Manage Device Requests**:
   - Review pending device registrations
   - Approve/deny with optional notes
   - Choose to replace existing devices

3. **Script Management**:
   - Upload new AI script versions
   - Encrypt and activate scripts
   - View script history and update notes

4. **Monitor System**:
   - View real-time dashboard
   - Check system health and usage
   - Review activity logs

## Configuration

### Device Management

```env
MAX_DEVICES_PER_USER=3          # Maximum devices per user
DEVICE_EXPIRY_DAYS=30           # Days before device expires
AUTO_APPROVE_DEVICES=false      # Auto-approve new devices
```

### Security Settings

```env
RATE_LIMIT_MAX=100              # Requests per hour
SESSION_DURATION=86400          # Admin session duration (seconds)
ENABLE_2FA=false                # Two-factor authentication
```

### System Options

```env
MAINTENANCE_MODE=false          # Enable maintenance mode
DEBUG_MODE=false                # Enable debug logging
ENABLE_ANALYTICS=true           # Usage analytics
```

## API Reference

### Core Functions

- `POST /validateDevice` - Validate device and get approval status
- `POST /getMainLoader` - Download main loader script for approved devices
- `POST /getDecryptionKey` - Get AES decryption key for device
- `POST /getEncryptedScript` - Download encrypted AI script
- `POST /getUpdateNotes` - Get version info and update notes

### Admin Functions

- `POST /adminLogin` - Admin authentication
- `POST /getDashboardData` - Dashboard statistics and data
- `POST /manageDevices` - Device approval/denial/blocking
- `POST /manageScripts` - Script upload/activation/management

### Public Functions

- `GET|POST /loader` - Generate personalized loader script

## Security Features

### Device Validation
- **Hardware Fingerprinting**: CPU, GPU, screen resolution, timezone
- **Browser Fingerprinting**: User agent, plugins, fonts, canvas
- **Unique Device ID**: SHA-256 hash of system characteristics
- **Expiration Management**: Automatic device expiry and cleanup

### Encryption
- **AES-256-GCM**: Industry-standard encryption
- **Unique Keys**: Each device gets a unique encryption key
- **Japanese Support**: Full UTF-8 character support
- **Integrity Checking**: SHA-256 checksums for all scripts

### Access Control
- **JWT Tokens**: Secure session management
- **Rate Limiting**: Prevent abuse and attacks
- **CORS Protection**: Secure cross-origin requests
- **Admin Authentication**: Bcrypt password hashing

## Monitoring & Logging

### Log Types
- **Security**: Failed logins, blocked access attempts
- **Admin**: Device approvals, script updates, settings changes
- **Device**: Registration, usage, expiry events
- **Script**: Delivery, decryption, execution events
- **Error**: System errors and exceptions

### Analytics
- **Usage Metrics**: Daily/monthly active devices
- **Performance**: Response times and error rates
- **Security Events**: Failed authentications and blocks
- **User Behavior**: Feature usage and patterns

## Troubleshooting

### Common Issues

**Device Not Approved**:
- Check admin panel for pending requests
- Verify device hasn't exceeded user limit
- Check device expiry date

**Script Not Loading**:
- Verify device is approved and active
- Check browser console for errors
- Ensure userscript extension is enabled

**Admin Panel Access**:
- Verify admin password in environment variables
- Check JWT secret configuration
- Clear browser cache and cookies

**Database Connection**:
- Verify Supabase URL and service key
- Check RLS policies are configured
- Ensure database migration was successful

### Debug Mode

Enable debug logging:
```env
DEBUG_MODE=true
LOG_LEVEL=debug
```

## Contributing

1. **Fork the repository**
2. **Create feature branch**: `git checkout -b feature/amazing-feature`
3. **Commit changes**: `git commit -m 'Add amazing feature'`
4. **Push to branch**: `git push origin feature/amazing-feature`
5. **Open Pull Request**

### Development Guidelines

- Follow existing code style and patterns
- Add comprehensive error handling
- Include security considerations
- Update documentation for new features
- Test thoroughly before submitting

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- **Supabase** for the excellent backend-as-a-service
- **Netlify** for seamless deployment and functions
- **Tailwind CSS** for beautiful, responsive design
- **Chart.js** for dashboard analytics visualization

## Support

For support, email admin@your-domain.com or create an issue in the GitHub repository.

---

**Built with ❤️ for enhanced learning experiences**