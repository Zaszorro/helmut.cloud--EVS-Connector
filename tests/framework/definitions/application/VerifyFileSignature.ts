import crypto from "crypto";
import fs from "fs";

export default class VerifyFileSignature {
    private publicKey = `-----BEGIN RSA PUBLIC KEY-----
MEgCQQDf91H2Jx8+eoV4HyDBO9deFQtdw1Xq40k2z4DulvvSMNxFAFQHi7ovntKo
0jfvVKnWDZdgFCFRmMMVnpZ+wYWPAgMBAAE=
-----END RSA PUBLIC KEY-----`;

    /**
     * verify validates a files signature or throws and error
     * @param absoluteFilePath absolute path to file to verify
     * @returns void or error if no signature found / invalid signature
     */
    verify = (absoluteFilePath: string): void => {
        const fileContent = fs.readFileSync(absoluteFilePath, "utf-8").toString().split("\n");
        if (fileContent[fileContent.length - 1].startsWith("//sig:")) {
            const md5 = crypto
                .createHash("md5")
                .update(fileContent.reduce((text, value, i, array) => (text += i < array.length - 1 ? "\n" + value : "")))
                .digest("hex");
            if (!this.verifyString(md5, fileContent[fileContent.length - 1].split(":")[1], this.publicKey)) {
                throw new Error("Invalid signature found in '" + absoluteFilePath + "'");
            }
        } else {
            throw new Error("No signature found in '" + absoluteFilePath + "'");
        }
    };

    private verifyString = (string: string, signatureB64: string, key: string): boolean => {
        return crypto.verify(
            "sha256",
            Buffer.from(string),
            {
                key: key,
                padding: crypto.constants.RSA_PKCS1_PSS_PADDING,
            },
            Buffer.from(signatureB64, "base64")
        );
    };
}
