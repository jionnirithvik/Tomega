import dotenv from 'dotenv';
dotenv.config();

import {
    makeWASocket,
    Browsers,
    fetchLatestBaileysVersion,
    DisconnectReason,
    useMultiFileAuthState,
} from '@whiskeysockets/baileys';
import { Handler, Callupdate, GroupUpdate } from './src/event/index.js';
import express from 'express';
import pino from 'pino';
import fs from 'fs';
import NodeCache from 'node-cache';
import path from 'path';
import chalk from 'chalk';
import moment from 'moment-timezone';
import axios from 'axios';
import config from './config.cjs';
import pkg from './lib/autoreact.cjs';
import MegaSessionManager from './lib/mega-session-manager.js';
const { emojis, doReact } = pkg;

const sessionName = "session";
const app = express();
const orange = chalk.bold.hex("#FFA500");
const lime = chalk.bold.hex("#32CD32");
let useQR = false;
let initialConnection = true;
const PORT = process.env.PORT || 3000;

const MAIN_LOGGER = pino({
    timestamp: () => `,"time":"${new Date().toJSON()}"`
});
const logger = MAIN_LOGGER.child({});
logger.level = "trace";

const msgRetryCounterCache = new NodeCache();

const __filename = new URL(import.meta.url).pathname;
const __dirname = path.dirname(__filename);

const sessionDir = path.join(__dirname, 'session');
const credsPath = path.join(sessionDir, 'creds.json');

if (!fs.existsSync(sessionDir)) {
    fs.mkdirSync(sessionDir, { recursive: true });
}

async function downloadSessionData() {
    // Try MEGA.nz first if credentials are available
    if (config.MEGA_EMAIL && config.MEGA_PASSWORD) {
        try {
            const megaManager = new MegaSessionManager(
                config.MEGA_EMAIL,
                config.MEGA_PASSWORD,
                config.MEGA_SESSION_FILE
            );
            
            const success = await megaManager.downloadSession(credsPath);
            await megaManager.close();
            
            if (success) {
                console.log("🔒 Session Successfully Loaded from MEGA.nz !!");
                return true;
            }
        } catch (error) {
            console.error('❌ Failed to download session from MEGA.nz:', error.message);
        }
    }
    
    // Fallback to Pastebin for backward compatibility
    if (config.SESSION_ID) {
        console.log('🔄 Falling back to Pastebin session download...');
        try {
            const sessdata = config.SESSION_ID.split("Ethix-MD&")[1];
            const url = `https://pastebin.com/raw/${sessdata}`;
            const response = await axios.get(url);
            const data = typeof response.data === 'string' ? response.data : JSON.stringify(response.data);
            await fs.promises.writeFile(credsPath, data);
            console.log("🔒 Session Successfully Loaded from Pastebin !!");
            return true;
        } catch (error) {
            console.error('❌ Failed to download session from Pastebin:', error.message);
        }
    }
    
    if (!config.MEGA_EMAIL && !config.SESSION_ID) {
        console.error('❌ Please add either MEGA.nz credentials (MEGA_EMAIL & MEGA_PASSWORD) or SESSION_ID env variables !!');
    }
    
    return false;
}

async function uploadSessionData() {
    if (!config.MEGA_EMAIL || !config.MEGA_PASSWORD) {
        console.log('📝 MEGA.nz credentials not available, skipping session upload');
        return false;
    }

    if (!fs.existsSync(credsPath)) {
        console.log('📝 No local session file to upload');
        return false;
    }

    try {
        const megaManager = new MegaSessionManager(
            config.MEGA_EMAIL,
            config.MEGA_PASSWORD,
            config.MEGA_SESSION_FILE
        );
        
        await megaManager.uploadSession(credsPath);
        await megaManager.close();
        
        console.log("☁️ Session Successfully Uploaded to MEGA.nz !!");
        return true;
    } catch (error) {
        console.error('❌ Failed to upload session to MEGA.nz:', error.message);
        return false;
    }
}

async function start() {
    try {
        const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
        const { version, isLatest } = await fetchLatestBaileysVersion();
        console.log(`🤖 Ethix-MD using WA v${version.join('.')}, isLatest: ${isLatest}`);
        
        const Matrix = makeWASocket({
            version,
            logger: pino({ level: 'silent' }),
            printQRInTerminal: useQR,
            browser: ["Ethix-MD", "safari", "3.3"],
            auth: state,
            getMessage: async (key) => {
                if (store) {
                    const msg = await store.loadMessage(key.remoteJid, key.id);
                    return msg.message || undefined;
                }
                return { conversation: "Ethix-MD whatsapp user bot" };
            }
        });

        Matrix.ev.on('connection.update', (update) => {
            const { connection, lastDisconnect } = update;
            if (connection === 'close') {
                if (lastDisconnect.error?.output?.statusCode !== DisconnectReason.loggedOut) {
                    start();
                }
            } else if (connection === 'open') {
                if (initialConnection) {
                    console.log(chalk.green("😃 Integration Successful️ ✅"));
                    Matrix.sendMessage(Matrix.user.id, { text: `😃 Integration Successful️ ✅` });
                    initialConnection = false;
                } else {
                    console.log(chalk.blue("♻️ Connection reestablished after restart."));
                }
            }
        });

        Matrix.ev.on('creds.update', async () => {
            await saveCreds();
            // Upload updated credentials to MEGA.nz if configured
            if (config.MEGA_EMAIL && config.MEGA_PASSWORD) {
                try {
                    console.log('🔄 Uploading updated session to MEGA.nz...');
                    await uploadSessionData();
                } catch (error) {
                    console.error('❌ Failed to upload session after credentials update:', error.message);
                }
            }
        });

        Matrix.ev.on("messages.upsert", async chatUpdate => await Handler(chatUpdate, Matrix, logger));
        Matrix.ev.on("call", async (json) => await Callupdate(json, Matrix));
        Matrix.ev.on("group-participants.update", async (messag) => await GroupUpdate(Matrix, messag));

        if (config.MODE === "public") {
            Matrix.public = true;
        } else if (config.MODE === "private") {
            Matrix.public = false;
        }

        Matrix.ev.on('messages.upsert', async (chatUpdate) => {
            try {
                const mek = chatUpdate.messages[0];
                if (!mek.key.fromMe && config.AUTO_REACT) {
                    console.log(mek);
                    if (mek.message) {
                        const randomEmoji = emojis[Math.floor(Math.random() * emojis.length)];
                        await doReact(randomEmoji, mek, Matrix);
                    }
                }
            } catch (err) {
                console.error('Error during auto reaction:', err);
            }
        });
    } catch (error) {
        console.error('Critical Error:', error);
        process.exit(1);
    }
}

async function init() {
    if (fs.existsSync(credsPath)) {
        console.log("🔒 Session file found, proceeding without QR code.");
        await start();
    } else {
        const sessionDownloaded = await downloadSessionData();
        if (sessionDownloaded) {
            console.log("🔒 Session downloaded, starting bot.");
            await start();
        } else {
            console.log("No session found or downloaded, QR code will be printed for authentication.");
            useQR = true;
            await start();
        }
    }
}

init();

app.get('/', (req, res) => {
    res.send('Hello World!');
});

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
