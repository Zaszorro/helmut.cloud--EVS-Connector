::wavedoc
---
title: EVS Connector — Create & Monitor Job
description: |
  Creates a new EVS Connector job via POST `/evsconn/v1/job` and polls its status every 5 seconds using GET `/evsconn/v1/job/status/{jobId}`.  
  The node continuously updates the dashboard progress output and supports configurable timeout behavior.

inputs:
  - name: Host URL
    description: |
      Base URL of the EVS Connector service (e.g., `http://host:8084` or `http://host:8084/evsconn/v1`).
    type: STRING
    mandatory: true
    example:
      - name: Host URL
        value: "http://10.0.0.1:8084"

  - name: Target Name
    description: |
      Logical destination target or system name within EVS/XSquare.
    type: STRING
    mandatory: true
    example:
      - name: Target Name
        value: "XSquare"

  - name: Target ID
    description: |
      Identifier of the target destination.
    type: STRING
    mandatory: true
    example:
      - name: Target ID
        value: "xq-target-01"

  - name: XSquare Priority (optional)
    description: |
      Optional XSquare priority value for job scheduling.
    type: STRING
    mandatory: false
    example:
      - name: Priority
        value: "5"

  - name: Metadata Set Name (optional)
    description: |
      Optional XSquare metadata profile name.
    type: STRING
    mandatory: false
    example:
      - name: Metadata Set
        value: "DefaultMeta"

  - name: File Path
    description: |
      Full path of the video or media file to transfer.
    type: STRING
    mandatory: true
    example:
      - name: File Path
        value: "C:/media/clip01.mov"

  - name: Metadata (optional)
    description: |
      JSON structure containing metadata. Accepts an array of objects or a key-value map.
    type: STRING_LONG
    mandatory: false
    example:
      - name: Metadata
        value: |
          [
            { "id": "title", "value": "My Clip" },
            { "id": "project", "value": "UEFA Highlights" }
          ]

  - name: Timeout (seconds)
    description: |
      Maximum number of seconds the node should continue polling before finishing.
    type: NUMBER
    mandatory: false
    default: 60
    example:
      - name: Timeout
        value: 60

  - name: Timeout As Failure
    description: |
      Determines node behavior when the timeout is reached:
        - `false` → Node finishes successfully after timeout.
        - `true` → Node fails if timeout is reached.
    type: BOOLEAN
    mandatory: false
    default: false
    example:
      - name: Timeout As Failure
        value: false

outputs:
  - name: Status Code
    description: |
      HTTP status code returned by the initial POST `/job` request.
    type: INT
    example:
      - name: Status
        value: 200

  - name: Headers
    description: |
      HTTP response headers from the POST request.
    type: STRING
    example:
      - name: Headers
        value: |
          {
            "content-type": "application/json"
          }

  - name: Body
    description: |
      JSON body of the POST `/job` response, containing job ID and initial state.
    type: OBJECT
    example:
      - name: Body
        value: |
          {
            "id": "1762853233578-662iviwq53p",
            "status": "EVS Checkin"
          }

  - name: Run time
    description: |
      Execution time (in milliseconds) for the job creation request.
    type: INT
    example:
      - name: Run time
        value: 123

  - name: Job ID
    description: |
      The job identifier returned (or generated) for polling.
    type: STRING
    example:
      - name: Job ID
        value: "1762853233578-662iviwq53p"

  - name: Job Status
    description: |
      Final status text from the last polling response.
    type: STRING
    example:
      - name: Job Status
        value: "EVS Checkin Successful"

  - name: Job Progress
    description: |
      Last reported progress value (0–100).
    type: NUMBER
    example:
      - name: Job Progress
        value: 100

  - name: Progress
    description: |
      Dashboard progress output updated every 5 seconds during polling.
    type: NUMBER
    example:
      - name: Progress
        value: 45

  - name: Polling Body
    description: |
      Full JSON response from the last polling request.
    type: OBJECT
    example:
      - name: Polling Body
        value: |
          {
            "id": "1762853233578-662iviwq53p",
            "status": "EVS Checkin Successful",
            "progress": 100
          }

connectors:
  - name: Success
    description: |
      Triggered when the job completes successfully or when timeout occurs and `Timeout As Failure` is `false`.

  - name: Fail
    description: |
      Triggered when:
        - Job creation returns a non-2xx HTTP code.
        - Polling detects a failure status (`FAILED`, `CANCELED`, etc.).
        - Timeout is reached and `Timeout As Failure` is `true`.

    causes:
      - name: Connection Error
        description: |
          Could not connect to EVS Connector service.
      - name: Invalid Input
        description: |
          Missing or invalid input fields (Host URL, Target ID, File Path, etc.).
      - name: Timeout
        description: |
          Polling reached the configured timeout duration and `Timeout As Failure` is set to `true`.
      - name: Job Failed
        description: |
          EVS Connector returned a terminal failure or canceled state.
      - name: Response Parsing Error
        description: |
          The response could not be parsed as JSON.

---
::