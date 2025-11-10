::wavedoc
---
title: HTTP Client
description: |
  The HTTP Client node allows you to make HTTP requests to interact with any app or service that has a REST API. You can use it to send requests, retrieve data, or modify information from remote servers using various HTTP methods.
inputs:
  - name: URL
    description: |
      Enter the full URL of the target resource or API endpoint. Ensure the URL is complete and includes the necessary protocol (e.g., https://)
    type: STRING
    mandatory: true
    example:
      - name: Windows
        value: https://helmut.cloud/
  - name: Method
    description: |
      Select the HTTP method for the request, which can be one of the following: GET to retrieve data from the server, POST to submit data to be processed, PUT to update existing data, PATCH to partially update data, or DELETE to remove data from the server
    type: STRING_SELECT
    mandatory: true
    example:
      - name: Windows
        value: GET
      - name: Unix
        value: GET
  - name: Headers
    description: |
      Enter any HTTP headers to be sent with the request. Use key-value pairs to define headers such as authorization tokens, content types, or custom headers
    type: STRING_MAP
    mandatory: false
    example:
      - name: Windows
        value: "Authorization: Bearer abc123"
      - name: Unix
        value: "Authorization: Bearer abc123"
  - name: Body
    description: |
      Enter the content to be sent in the request body (typically used with POST, PUT, or PATCH requests)
    type: STRING_LONG
    mandatory: false
    example:
      - name: Windows
        value: '{ "userId": 123, "userName": "HelmutCloud", "email": "hellofrom@helmut.cloud" }'
      - name: Unix
        value: '{ "userId": 123, "userName": "HelmutCloud", "email": "hellofrom@helmut.cloud" }'
  - name: Fail on non-2XX Response
    description: |
      Enable this option to trigger the Fail output connector if the HTTP response code is outside the successful 2xx range. This ensures the node reacts to unsuccessful responses, such as client or server errors (e.g., 4xx or 5xx status codes)
    type: BOOLEAN
    mandatory: false
  - name: Follow Redirects
    description: |
      Enable this option to allow the node to automatically follow HTTP redirect requests (e.g., 301 or 302 status codes). If this option is disabled and a redirect occurs, the node will fail instead of following the redirect
    type: BOOLEAN
    mandatory: false
  - name: Ignore invalid SSL Certificate
    description: |
      Enable this option to allow the node to continue with HTTP requests even if the server's SSL certificate is invalid or untrusted. If this option is disabled, the node will fail if it encounters an invalid certificate
    type: BOOLEAN
    mandatory: false
  - name: Timeout
    description: |
      Set the number of seconds the node should wait for a response from the server before timing out and failing
    type: INT
    mandatory: false
    example:
      - name: Windows
        value: 60
      - name: Unix
        value: 60
outputs:
  - name: Status Code
    description: |
      Returns the HTTP status code received from the server after the request is completed. This code reflects whether the request was successful (e.g., 2xx), encountered a client error (e.g., 4xx), or resulted in a server error (e.g., 5xx)
    type: INT
    example:
      - name: Status Code
        value: 200
  - name: Headers
    description: |
      Returns the HTTP response headers as key-value pairs
    type: STRING
    example:
      - name: Headers
        value: |
          {
            "Content-Type": "application/json",
            "Content-Length": "123",
            "Server": "Apache/2.4.1",
            "Set-Cookie": "sessionId=abc123; Path=/; HttpOnly",
            "Date": "Wed, 21 Oct 2023 07:28:00 GMT",
            "Connection": "keep-alive"
          }
  - name: Body
    description: |
      Returns the body of the HTTP response, containing the actual data retrieved from the server
    type: OBJECT
    example:
      - name: Body
        value: |
          {
            "userId": 123,
            "userName": "HelmutCloud",
            "email": "hellofrom@helmut.cloud"
          }
connectors:
  - name: Success
    description: |
      Triggered when the HTTP request is completed successfully, and the server returns a response within the 2xx status code range
  - name: Fail
    description: |
      Triggered when the HTTP request fails or encounters an error
    causes:
      - name: Network Issue
        description: |
          If helmut.cloud agent is unable to establish a connection due to network problems
      - name: DNS Resolution Failure
        description: |
          If the helmut.cloud agent is unable to resolve the server's DNS name
      - name: Invalid Configuration
        description: |
          If the node is misconfigured or lacks necessary parameters
      - name: Timeout
        description: |
          If the HTTP request exceeded the specified timeout value without receiving a response
      - name: Invalid SSL Certificate
        description: |
          If the node encounters an invalid SSL certificate, and the "Ignore Invalid SSL Certificate" option is disabled
      - name: Redirect Found
        description: |
          If the server returns a redirect, and the "Follow Redirects" option is disabled
      - name: Response Parsing Error
        description: |
          If the node cannot correctly parse the response from the server
      - name: Non-2xx Response Code
        description: |
          If the server returns a response code outside of the 2xx range, and the "Fail on non-2XX Response" option is enabled
---
::
