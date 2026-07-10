const crypto = require('crypto');
const { ethers } = require('ethers');

// requestIds act as bearer tokens for verification sessions, so they must be
// generated from a cryptographically secure source.
function generateRequestId(length = 12) {
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    const bytes = crypto.randomBytes(length);
    let result = '';
    for (let i = 0; i < length; i++) {
        result += characters.charAt(bytes[i] % characters.length);
    }
    return result;
}

// The exact text the user signs in their wallet. Do not change the wording
// without coordinating with the frontend — it is displayed there verbatim.
function buildSignMessage(community, userName, interactionId, timestamp) {
    const regex = /[^a-zA-Z0-9\s#]/g;
    return "- ThetaGuard (thetaguard.opentheta.io) asks you to sign this message for the purpose of verifying your account ownership. This is READ-ONLY access and will NOT trigger any blockchain transactions or incur any fees.\n" +
        "\n" +
        "- Community: " + community.replace(regex, '') + "\n" +
        "- User: " + userName.replace(regex, '') + "\n" +
        "- Discord Interaction: " + interactionId + "\n" +
        "- Timestamp: " + timestamp;
}

// Recovers the signer address of a signed message. Throws on a malformed
// signature (callers translate that into their error response).
function recoverSigner(message, signature) {
    return ethers.verifyMessage(message, signature);
}

module.exports = { generateRequestId, buildSignMessage, recoverSigner };
