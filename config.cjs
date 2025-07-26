const config = {
    SESSION_ID: process.env.SESSION_ID || '',
    MEGA_EMAIL: process.env.MEGA_EMAIL || '',
    MEGA_PASSWORD: process.env.MEGA_PASSWORD || '',
    MEGA_SESSION_FILE: process.env.MEGA_SESSION_FILE || 'session.json',
    MODE: process.env.MODE || 'private',
    AUTO_REACT: process.env.AUTO_REACT === 'true' || false,
    PORT: process.env.PORT || 3000
};

module.exports = config;