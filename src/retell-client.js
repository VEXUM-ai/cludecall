// Retell AI SDKクライアント初期化
import Retell from "retell-sdk";
import { config } from "./config.js";

export const retellClient = new Retell({
    apiKey: config.retellApiKey,
});
