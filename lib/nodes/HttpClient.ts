import Node from "../Node";
import axios, { AxiosRequestConfig, AxiosResponse } from "axios";
import {
    StreamNodeSpecificationInputType,
    StreamNodeSpecificationOutputType,
    StreamNodeSpecificationV2,
} from "hcloud-sdk/lib/interfaces/high5";
import https from "https";

enum Input {
    URL = "URL",
    METHOD = "Method",
    HEADERS = "Headers",
    BODY = "Body",
    FAIL_ON_NON_2XX_RESPONSE = "Fail on non-2XX Response",
    FOLLOW_REDIRECTS = "Follow Redirects",
    IGNORE_INVALID_SSL_CERTIFICATE = "Ignore invalid SSL Certificate",
    TIMEOUT = "Timeout",
}

enum Output {
    EXECUTION = "Execution",
    STATUS_CODE = "Status Code",
    HEADERS = "Headers",
    BODY = "Body",
    DURATION = "Run time",
}

interface HttpResponse {
    /* HTTP status code from the application server. Status codes include: 2xx: Successful responses(e.g., 200 OK, 201 Created, 204 No Content). 3xx: Redirection messages(e.g., 301 Moved Permanently). 4xx: Client error responses(e.g., 400 Bad Request, 401 Unauthorized, 403 Forbidden, 404 Not Found). 5xx: Server error responses(e.g., 500 Internal Server Error, 503 Service Unavailable) */
    [Output.STATUS_CODE]: number;
    /* HTTP response headers from the application server */
    [Output.HEADERS]: object;
    /* Response body from the application server. The output may be empty in scenarios like successful requests without content (204), HEAD requests, redirections, unmodified resources (304), client/server errors, or specific API designs */
    [Output.BODY]: string | object;
}

export default class HttpClient extends Node {
    specification: StreamNodeSpecificationV2 = {
        specVersion: 2,
        name: "HTTP Client",
        description: "HTTP client for sending HTTP requests",
        category: "Networking",
        version: {
            major: 0,
            minor: 0,
            patch: 1,
            changelog: [],
        },
        author: {
            name: "",
            company: "",
            email: "",
        },
        inputs: [
            {
                name: Input.URL,
                description: "Enter the URL of the HTTP service",
                type: StreamNodeSpecificationInputType.STRING,
                example: "https://app.helmut.cloud/api/",
                mandatory: true,
            },
            {
                name: Input.METHOD,
                description: "Choose the HTTP method to send the request",
                type: StreamNodeSpecificationInputType.STRING_SELECT,
                /**
                 * options keys will be displayed in the stream designer and
                 * the values will be the input received by the node when executed
                 */
                options: {
                    GET: "GET",
                    POST: "POST",
                    DELETE: "DELETE",
                    PUT: "PUT",
                },
                example: "GET",
                defaultValue: "POST",
                mandatory: true,
            },
            {
                name: Input.HEADERS,
                description: "Enter HTTP headers to be included with the request",
                type: StreamNodeSpecificationInputType.STRING_MAP,
                example: { Authorization: "Bearer your_bearer_token" },
            },
            {
                name: Input.BODY,
                description: "Enter the HTTP request body content",
                type: StreamNodeSpecificationInputType.STRING_LONG,
                example: '{ "userId": 123, "userName": "HelmutCloud", "email": "hellofrom@helmut.cloud" }',
            },
            {
                name: Input.FAIL_ON_NON_2XX_RESPONSE,
                description:
                    "Enable this option to trigger the fail output connector if the HTTP response code falls outside the 2xx range",
                type: StreamNodeSpecificationInputType.BOOLEAN,
                example: false,
                defaultValue: false,
            },
            {
                name: Input.FOLLOW_REDIRECTS,
                description:
                    "Enable this option if the node should follow HTTP redirect requests. If disabled and a redirect request is sent, the node will fail.",
                type: StreamNodeSpecificationInputType.BOOLEAN,
                example: false,
                defaultValue: true,
            },
            {
                name: Input.IGNORE_INVALID_SSL_CERTIFICATE,
                description:
                    "Enable this option to allow the node to continue with HTTP requests even if the SSL certificate of the application server is invalid. If disabled and an invalid certificate is detected, the node will fail.",
                type: StreamNodeSpecificationInputType.BOOLEAN,
                example: false,
                defaultValue: false,
            },
            {
                name: Input.TIMEOUT,
                description: "Enter the number of seconds the HTTP node should wait for a response before it times out and fails.",
                type: StreamNodeSpecificationInputType.NUMBER,
                example: 10,
                defaultValue: 60,
            },
        ],
        outputs: [
            {
                name: Output.EXECUTION,
                description: "Response data - status code, headers and body",
                type: StreamNodeSpecificationOutputType.JSON,
                example: {
                    [Output.STATUS_CODE]: 200,
                    [Output.HEADERS]: {
                        "Content-Type": "application/json",
                        "Content-Length": "123",
                        Server: "Apache/2.4.1",
                        "Set-Cookie": "sessionId=abc123; Path=/; HttpOnly",
                        Date: "Wed, 21 Oct 2024 07:28:00 GMT",
                        Connection: "keep-alive",
                    },
                    [Output.BODY]: '{ "userId": 123, "userName": "HelmutCloud", "email": "hellofrom@helmut.cloud" }',
                },
            },
            {
                name: Output.DURATION,
                description: "Returns the total amount of time taken by the node to execute the node in milliseconds",
                type: StreamNodeSpecificationOutputType.NUMBER,
                example: 200,
            },
        ],
    };

    async execute(): Promise<void> {
        const startTime = performance.now();

        const method = this.wave.inputs.getInputValueByInputName(Input.METHOD) as string;
        const url = this.wave.inputs.getInputValueByInputName(Input.URL) as string;
        const headers = this.wave.inputs.getInputValueByInputName(Input.HEADERS) as Record<string, string | string[]> | undefined;
        const data = this.wave.inputs.getInputValueByInputName(Input.BODY) as string | undefined;
        const timeout = this.wave.inputs.getInputValueByInputName(Input.TIMEOUT) as number;
        const ignoreSSLCert = this.wave.inputs.getInputValueByInputName(Input.IGNORE_INVALID_SSL_CERTIFICATE) as boolean;
        const failOnNon2XXResponse = this.wave.inputs.getInputValueByInputName(Input.FAIL_ON_NON_2XX_RESPONSE) as boolean;
        const followRedirects = this.wave.inputs.getInputValueByInputName(Input.FOLLOW_REDIRECTS) as boolean;

        const requestConfig: AxiosRequestConfig = {
            method: method,
            url: url,
            headers: headers,
            data: data,
            timeout: timeout * 1000,
            transformResponse: (res) => res,
        };

        if (ignoreSSLCert) {
            const agent = new https.Agent({ rejectUnauthorized: false });
            requestConfig.httpsAgent = agent;
        }

        if (failOnNon2XXResponse) {
            requestConfig.validateStatus = (status) => status >= 200 && status < 300;
        } else {
            requestConfig.validateStatus = () => true;
        }

        if (!followRedirects) {
            const oldValidateStatus = requestConfig.validateStatus;
            requestConfig.validateStatus = (s) => {
                if (s >= 300 && s < 400) {
                    return false;
                }
                return oldValidateStatus(s);
            };
            requestConfig.maxRedirects = 0;
        }

        try {
            const res = await axios.request(requestConfig);

            const output = {
                [Output.STATUS_CODE]: res.status,
                [Output.HEADERS]: res.headers,
                [Output.BODY]: this.parseBody(res),
            } as HttpResponse;
            this.wave.outputs.setOutput(Output.EXECUTION, output);
        } catch (err: unknown) {
            if (axios.isAxiosError(err)) {
                const output = {
                    [Output.STATUS_CODE]: err.response?.status,
                    [Output.HEADERS]: err.response?.headers,
                    [Output.BODY]: err.response?.data,
                } as HttpResponse;
                this.wave.outputs.setOutput(Output.EXECUTION, output);
                throw new Error(err.name + ": " + err.message);
            } else {
                throw err;
            }
        } finally {
            this.wave.outputs.setOutput(Output.DURATION, performance.now() - startTime);
        }
    }

    parseBody(response: AxiosResponse): string | object {
        const contentType = response.headers["content-type"];
        if (!contentType) {
            return response.data;
        }

        if (contentType.includes("application/json")) {
            try {
                return JSON.parse(response.data);
                // eslint-disable-next-line @typescript-eslint/no-unused-vars
            } catch (_) {
                return response.data;
            }
        }

        return response.data;
    }
}
