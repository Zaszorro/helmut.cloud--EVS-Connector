import { AxiosRequestHeaders, AxiosResponse } from "axios";
import HttpClient from "../../lib/nodes/HttpClient";

describe("HttpClient", () => {
    it("should parse body according to response headers", () => {
        const response: AxiosResponse = {
            headers: { "content-type": "application/json" },
            data: '{"key":"value"}',
            status: 0,
            statusText: "",
            config: {
                headers: {} as AxiosRequestHeaders,
            },
        };

        const testResult = HttpClient.prototype.parseBody(response);

        expect(testResult).toEqual(JSON.parse(response.data));
    });

    it("should return body as string if content-type is not application/json", () => {
        const response: AxiosResponse = {
            headers: { "content-type": "text/html" },
            data: "<html></html>",
            status: 0,
            statusText: "",
            config: {
                headers: {} as AxiosRequestHeaders,
            },
        };

        const testResult = HttpClient.prototype.parseBody(response);

        expect(testResult).toEqual(response.data);
    });

    it("should return body as string if content-type header is missing", () => {
        const response: AxiosResponse = {
            headers: {},
            data: "body",
            status: 0,
            statusText: "",
            config: {
                headers: {} as AxiosRequestHeaders,
            },
        };

        const testResult = HttpClient.prototype.parseBody(response);

        expect(testResult).toEqual(response.data);
    });
});
