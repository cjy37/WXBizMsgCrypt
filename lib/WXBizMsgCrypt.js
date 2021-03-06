const crypto = require('crypto');
const XMLParser = require('xml2js');
const Promise = require('bluebird');
const parseXML = Promise.promisify(XMLParser.parseString);
const buildXML = new XMLParser.Builder({ rootName: 'xml', cdata: true, headless: true, renderOpts: { indent: ' ', pretty: 'true' } });

// please decode the url before initializing this function
function WXCrypt(appID, token, encodingAESKey) {
    this.appID = appID;
    this.token = token;
    this.aesKey = new Buffer(encodingAESKey + '=', 'base64');
    this.iv = this.aesKey.slice(0, 16);
}

WXCrypt.prototype.decryptMsg = function (msgSignature, timestamp, nonce, data) {
    const msg_encrypt = data.Encrypt;
    //if(data.ToUserName!=this.appID)throw new Error("ToUserName is invalid");
    if (this.getSignature(timestamp, nonce, msg_encrypt) != msgSignature) throw new Error('msgSignature is not invalid');
    const decryptedMessage = this.decrypt(msg_encrypt);
    return parseXML(decryptedMessage, { explicitArray: false });
};

WXCrypt.prototype.encryptMsg = function (replyMsg, opts) {
    const result = {};
    const options = opts || {};
    result.Encrypt = this.encrypt(replyMsg);
    result.Nonce = options.nonce || parseInt((Math.random() * 100000000000), 10);
    result.TimeStamp = options.timestamp || Date.now();

    result.MsgSignature = this.getSignature(result.TimeStamp, result.Nonce, result.Encrypt);

    return buildXML.buildObject(result);
};

WXCrypt.prototype.encrypt = function (xmlMsg) {
    const random16 = crypto.pseudoRandomBytes(16);

    const msg = new Buffer(xmlMsg);

    const msgLength = new Buffer(4);
    msgLength.writeUInt32BE(msg.length, 0);

    const corpId = new Buffer(this.appID);

    const raw_msg = Buffer.concat([random16, msgLength, msg, corpId]);//randomString + msgLength + xmlMsg + this.corpID;
    const encoded = PKCS7Encoder(raw_msg);
    const cipher = crypto.createCipheriv('aes-256-cbc', this.aesKey, this.iv);
    cipher.setAutoPadding(false);// crypto的padding模式不是PKCS7!!!

    // const cipheredMsg = Buffer.concat([cipher.update(/*encoded*/raw_msg), cipher.final()]);
    const cipheredMsg = Buffer.concat([cipher.update(encoded), cipher.final()]);

    return cipheredMsg.toString('base64');
};

WXCrypt.prototype.decrypt = function (str) {
    const aesCipher = crypto.createDecipheriv("aes-256-cbc", this.aesKey, this.iv);
    aesCipher.setAutoPadding(false);
    let decipheredBuff = Buffer.concat([aesCipher.update(str, 'base64'), aesCipher.final()]);

    decipheredBuff = PKCS7Decoder(decipheredBuff);

    const len_netOrder_corpid = decipheredBuff.slice(16);

    const msg_len = len_netOrder_corpid.slice(0, 4).readUInt32BE(0);
    //recoverNetworkBytesOrder(len_netOrder_corpid.slice(0, 4));

    const result = len_netOrder_corpid.slice(4, msg_len + 4).toString();

    const appId = len_netOrder_corpid.slice(msg_len + 4).toString();

    if (appId != this.appID) throw new Error('appId is invalid');

    return result;

};

WXCrypt.prototype.getSignature = function (timestamp, nonce, encrypt) {
    const raw_signature = [this.token, timestamp, nonce, encrypt].sort().join('');

    const sha1 = crypto.createHash("sha1");
    sha1.update(raw_signature);

    return sha1.digest("hex");
};

function PKCS7Decoder(buff) {
    const pad = buff[buff.length - 1];

    if (pad < 1 || pad > 32) {
        pad = 0;
    }

    return buff.slice(0, buff.length - pad);
}

function PKCS7Encoder(buff) {
    const blockSize = 32;
    const strSize = buff.length;
    const amountToPad = blockSize - (strSize % blockSize);

    const pad = new Buffer(amountToPad);
    pad.fill(String.fromCharCode(amountToPad));

    return Buffer.concat([buff, pad]);
}

module.exports = WXCrypt;

