require("dotenv").config();

const FOOTER_TEXT = "**Make sure you sign the EXACT message and NEVER share your seed phrase or private key.**"
const DESCRIPTION = "You should expect to sign the following message when prompted by a non-custodial wallet such as MetaMask:"
const LOGO_URL = "https://images.opentheta.io/creators/opentheta.jpg"
// const VERIFY_BASE_URL = "http://localhost:3000/thetaguard/"
const VERIFY_BASE_URL = "https://next.opentheta.io/thetaguard/"
const API_BASE_URL = process.env.API_BASE_URL || "https://api.opentheta.io/v1/"

let USER_REQUESTS = {}
let ADMIN_REQUESTS = {}


module.exports = {
    FOOTER_TEXT,
    DESCRIPTION,
    LOGO_URL,
    USER_REQUESTS,
    VERIFY_BASE_URL,
    ADMIN_REQUESTS,
    API_BASE_URL,
}