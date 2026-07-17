# Audit Guide: ISO 29148 Traceability & Compliance

DuckDeploy provides automated generation of ISO 29148 traceability reports to facilitate regulatory audits and prove software integrity. This guide explains how the traceability matrix is constructed, defines the integrity hashes used, and provides instructions for verifying these hashes against the source data.

## ISO 29148 Traceability Matrix Construction

The `traceability-matrix.json` artifact maps frontend application requirements (manifest paths) to backend specifications (OpenAPI definitions). It is constructed by static analysis during the `npm run generate:traceability` step.

The matrix links requirements to their corresponding data sources:

- **[Manifest Generation Log](https://fderuiter.github.io/DuckDeploy/compliance/manifest-generation-log.json)**: The mapping between components and API paths.
- **[Contract Validation Report](https://fderuiter.github.io/DuckDeploy/compliance/contract-validation-report.json)**: The results of statically verifying the UI mapping against the OpenAPI contract constraints.
- **[Test Results (JUnit)](https://fderuiter.github.io/DuckDeploy/compliance/junit.xml)**: The results of test runs mapped to requirements.
- **[Traceability Matrix](https://fderuiter.github.io/DuckDeploy/compliance/traceability-matrix.json)**: The resulting ISO 29148 compliance matrix containing all traces and integrity hashes.

## Integrity Hashes (Certificates)

To prove that the deployed artifacts haven't been tampered with, DuckDeploy calculates three machine-checkable hashes embedded within the traceability matrix's header:

### `pi_struct` (Structural Integrity)

Ensures that all mapped UI components point to valid requirements without modification. It is calculated by hashing the combination of `requirement` (pointer) and `component` paths for all entries in the generation log.

### `pi_sem` (Semantic Consistency)

Ensures no active paths have discarded or unmapped fields. It is calculated by hashing the list of `requirement` paths for all entries marked with the `discarded` status.

### `pi_logic` (Logical Validation)

Ensures that contract enforcement and validation rules are not bypassed. It is calculated by hashing the `violations` array found in the contract validation report.

## How to Verify Hashes

You can verify these hashes manually or automatically to ensure the traceability matrix matches the deployed data sources.

### Step-by-Step Verification Instructions

1. **Obtain the compliance artifacts** from the deployed site:
   - `traceability-matrix.json`
   - `manifest-generation-log.json`
   - `contract-validation-report.json`

2. **Verify `pi_struct` (Structural Integrity)**:
   - Extract the `requirement` and `component` fields from every entry in the `manifest-generation-log.json` file.
   - Map them to an array of objects like `[{"req": "...", "comp": "..."}, ...]`.
   - Calculate the SHA-256 hash of the JSON stringified array.
   - Compare the output with the `pi_struct` value in the traceability matrix.

3. **Verify `pi_sem` (Semantic Consistency)**:
   - Filter the entries in `manifest-generation-log.json` where the status is `discarded`.
   - Extract their `requirement` fields into an array like `["...", "..."]`.
   - Calculate the SHA-256 hash of the JSON stringified array.
   - Compare the output with the `pi_sem` value in the traceability matrix.

4. **Verify `pi_logic` (Logical Validation)**:
   - Extract the `violations` array from `contract-validation-report.json` (or `[]` if none exist).
   - Calculate the SHA-256 hash of the JSON stringified array.
   - Compare the output with the `pi_logic` value in the traceability matrix.

All calculations use a standard SHA-256 hash digested into a hex string format, prefixed with `0x` in the traceability matrix.
