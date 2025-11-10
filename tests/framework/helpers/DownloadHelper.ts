import axios, { AxiosRequestConfig } from "axios";
import fs from "fs";

export async function downloadFile(url: string, dest: string, options?: AxiosRequestConfig): Promise<void> {
    const response = await axios.get(url, {
        ...options,
        responseType: "stream",
    });

    return new Promise<void>((res, rej) => {
        const ws = fs.createWriteStream(dest);
        const rs = response.data as fs.ReadStream;

        ws.on("error", rej);
        rs.on("error", rej);
        rs.pipe(ws).on("close", res).on("error", rej);
    });
}
