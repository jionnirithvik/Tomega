import dotenv from 'dotenv';
dotenv.config();

import {
    makeWASocket,
    Browsers,
    fetchLatestBaileysVersion,
    DisconnectReason,
    useMultiFileAuthState,
} from '@whiskeysockets/baileys';
import { Storage } from 'megajs';
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
    if (!config.MEGA_EMAIL || !config.MEGA_PASSWORD || !config.MEGA_SESSION_FILE) {
        console.error('Please add MEGA_EMAIL, MEGA_PASSWORD, and MEGA_SESSION_FILE to env !!');
        return false;
    }
    
    try {
        const storage = await new Storage({
            email: config.MEGA_EMAIL,
            password: config.MEGA_PASSWORD
        }).ready;
        
        const file = storage.root.children.find(child => child.name === config.MEGA_SESSION_FILE);
        if (!file) {
            console.error(`Session file ${config.MEGA_SESSION_FILE} not found in MEGA.nz storage`);
            return false;
        }
        
        const data = await file.downloadBuffer();
        await fs.promises.writeFile(credsPath, data);
        console.log("🔒 Session Successfully Loaded from MEGA.nz !!");
        return true;
    } catch (error) {
        console.error('Failed to download session data from MEGA.nz:', error.message);
        return false;
    }
}

async function uploadSessionData() {
    if (!config.MEGA_EMAIL || !config.MEGA_PASSWORD || !config.MEGA_SESSION_FILE) {
        console.error('MEGA credentials not configured for session upload');
        return false;
    }
    
    try {
        if (!fs.existsSync(credsPath)) {
            console.log('No session file to upload');
            return false;
        }
        
        const storage = await new Storage({
            email: config.MEGA_EMAIL,
            password: config.MEGA_PASSWORD
        }).ready;
        
        const sessionData = await fs.promises.readFile(credsPath);
        
        // Check if file already exists and delete it
        const existingFile = storage.root.children.find(child => child.name === config.MEGA_SESSION_FILE);
        if (existingFile) {
            await existingFile.delete();
        }
        
        // Upload new session file
        await storage.upload(config.MEGA_SESSION_FILE, sessionData).complete;
        console.log("🔒 Session Successfully Uploaded to MEGA.nz !!");
        return true;
    } catch (error) {
        console.error('Failed to upload session data to MEGA.nz:', error.message);
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
            await uploadSessionData();
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
