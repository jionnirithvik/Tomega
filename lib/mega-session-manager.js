// MEGA.nz integration for session storage
import { Storage } from 'megajs';
import fs from 'fs';
import path from 'path';

class MegaSessionManager {
    constructor(email, password, sessionFileName = 'session.json') {
        this.email = email;
        this.password = password;
        this.sessionFileName = sessionFileName;
        this.storage = null;
    }

    async connect() {
        if (this.storage) {
            return this.storage;
        }

        try {
            this.storage = new Storage({
                email: this.email,
                password: this.password
            });
            
            await this.storage.login();
            console.log('🔑 MEGA.nz login successful');
            return this.storage;
        } catch (error) {
            console.error('❌ Failed to connect to MEGA.nz:', error.message);
            // Provide more specific error messages
            if (error.message.includes('ENOTFOUND') || error.message.includes('EAI_AGAIN')) {
                throw new Error('Network connection to MEGA.nz failed. Please check your internet connection.');
            } else if (error.message.includes('Incorrect email or password')) {
                throw new Error('Invalid MEGA.nz credentials. Please check your email and password.');
            } else {
                throw new Error(`MEGA.nz connection failed: ${error.message}`);
            }
        }
    }

    async downloadSession(localPath) {
        try {
            await this.connect();
            
            // Look for the session file in MEGA.nz
            const file = this.storage.root.find(this.sessionFileName);
            
            if (!file) {
                console.log(`📄 Session file '${this.sessionFileName}' not found in MEGA.nz`);
                return false;
            }

            console.log(`📥 Downloading session file from MEGA.nz: ${this.sessionFileName}`);
            const buffer = await file.downloadBuffer();
            
            // Ensure directory exists
            const dir = path.dirname(localPath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            
            // Write to local file
            await fs.promises.writeFile(localPath, buffer);
            console.log(`✅ Session file downloaded successfully to: ${localPath}`);
            return true;
        } catch (error) {
            console.error('❌ Failed to download session from MEGA.nz:', error.message);
            return false;
        }
    }

    async uploadSession(localPath) {
        try {
            await this.connect();
            
            if (!fs.existsSync(localPath)) {
                throw new Error(`Local session file not found: ${localPath}`);
            }

            console.log(`📤 Uploading session file to MEGA.nz: ${this.sessionFileName}`);
            
            // Check if file already exists and delete it
            const existingFile = this.storage.root.find(this.sessionFileName);
            if (existingFile) {
                console.log(`🗑️ Removing existing session file from MEGA.nz`);
                // Note: megajs might not have a direct delete method, so we'll overwrite
            }
            
            // Upload the new session file
            const uploadOptions = {
                name: this.sessionFileName,
                size: fs.statSync(localPath).size
            };
            
            const fileStream = fs.createReadStream(localPath);
            const uploadedFile = await this.storage.upload(uploadOptions, fileStream);
            
            console.log(`✅ Session file uploaded successfully to MEGA.nz`);
            return uploadedFile;
        } catch (error) {
            console.error('❌ Failed to upload session to MEGA.nz:', error.message);
            throw error;
        }
    }

    async close() {
        if (this.storage) {
            this.storage.close();
            this.storage = null;
        }
    }
}

export default MegaSessionManager;