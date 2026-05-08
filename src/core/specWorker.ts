import yaml from 'js-yaml';
import $RefParser from '@apidevtools/json-schema-ref-parser';

self.onmessage = async (e: MessageEvent) => {
  try {
    const { buffer } = e.data;

    const decoder = new TextDecoder('utf-8');
    const specString = decoder.decode(buffer);

    const parsedJson = yaml.load(specString);

    if (!parsedJson || typeof parsedJson !== 'object') {
      throw new Error('Failed to parse OpenAPI YAML');
    }

    const resolvedSpec = await $RefParser.dereference(parsedJson as any);

    const encoder = new TextEncoder();
    const resultString = JSON.stringify(resolvedSpec);
    const resultBuffer = encoder.encode(resultString).buffer;

    self.postMessage({ type: 'SUCCESS', buffer: resultBuffer }, { transfer: [resultBuffer] });
  } catch (error) {
    self.postMessage({ type: 'ERROR', error: error instanceof Error ? error.message : String(error) });
  }
};
