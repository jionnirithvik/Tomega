# Tomega

A WhatsApp bot with MEGA.nz session storage integration.

## Features

- WhatsApp bot functionality using Baileys
- Session storage with MEGA.nz integration
- Backward compatibility with Pastebin session storage
- Automatic session backup to MEGA.nz
- Express web server

## Environment Variables

### MEGA.nz Configuration (Recommended)
- `MEGA_EMAIL` - Your MEGA.nz account email
- `MEGA_PASSWORD` - Your MEGA.nz account password  
- `MEGA_SESSION_FILE` - Name of session file in MEGA.nz (default: `session.json`)

### Legacy Configuration (Backward Compatibility)
- `SESSION_ID` - Pastebin session ID (format: `Ethix-MD&<pastebin_id>`)

### Other Configuration
- `MODE` - Bot mode (`public` or `private`, default: `private`)
- `AUTO_REACT` - Enable auto-reactions (`true` or `false`, default: `false`)
- `PORT` - Server port (default: `3000`)

## Usage

1. Set up your environment variables (preferably MEGA.nz credentials)
2. Run the bot: `npm start`
3. If no session is found, scan the QR code to authenticate
4. Session will be automatically backed up to MEGA.nz (if configured)

## Session Storage

The bot now supports two methods of session storage:

1. **MEGA.nz (Primary)**: Secure cloud storage with automatic backup
   - Sessions are downloaded from MEGA.nz on startup if available
   - Sessions are automatically uploaded to MEGA.nz when credentials change
   - More secure and reliable than Pastebin

2. **Pastebin (Legacy)**: Fallback for backward compatibility
   - Used only if MEGA.nz credentials are not provided
   - Requires `SESSION_ID` environment variable

## Installation

```bash
npm install
npm start
```