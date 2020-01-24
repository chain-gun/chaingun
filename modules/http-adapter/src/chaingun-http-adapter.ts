import {
  ChangeSetEntry,
  GunGetOpts,
  GunGraphAdapter,
  GunGraphData,
  GunNode
} from '@chaingun/types';
import EventSource from 'eventsource';
import 'isomorphic-fetch';

const BASE_HEADERS = {
  Accept: 'application/json',
  'Content-Type': 'application/json'
};

export function createGraphAdapter(
  baseUrl: string,
  fetchOpts: any = {}
): GunGraphAdapter {
  return {
    get: (soul: string, opts?: GunGetOpts) =>
      get(fetchOpts, baseUrl, soul, opts),
    onChange: (handler: (change: ChangeSetEntry) => void, from?: string) =>
      onChange(baseUrl, handler, from),
    put: (graphData: GunGraphData) => put(fetchOpts, baseUrl, graphData)
  };
}

export async function get(
  fetchOpts: any,
  baseUrl: string,
  soul: string,
  opts?: GunGetOpts
): Promise<GunNode | null> {
  const singleKey = opts && opts['.'];
  const fromLex = opts && opts['>'];
  const toLex = opts && opts['<'];

  const url = singleKey
    ? `${baseUrl}/key/${encodeURI(singleKey)}/from_node/${encodeURI(soul)}`
    : fromLex && toLex
    ? `${baseUrl}/keys/from/${encodeURI(fromLex)}/to/${encodeURI(
        toLex
      )}/from_node/${encodeURI(soul)}`
    : fromLex
    ? `${baseUrl}/keys/from/${encodeURI(fromLex)}/from_node/${encodeURI(soul)}`
    : toLex
    ? `${baseUrl}/keys/to/${encodeURI(toLex)}/from_node/${encodeURI(soul)}`
    : `${baseUrl}/nodes/${encodeURI(soul)}`;
  const response = await fetch(url, fetchOpts);

  if (response.status === 404) {
    return null;
  }

  if (response.status >= 400) {
    throw new Error('Bad response from server: ' + response.status);
  }

  const json = await response.json();

  if (!json) {
    return null;
  }

  return json;
}

export async function put(
  fetchOpts: any,
  baseUrl: string,
  data: GunGraphData
): Promise<GunGraphData | null> {
  const url = `${baseUrl}/nodes`;
  const response = await fetch(url, {
    headers: BASE_HEADERS,
    ...fetchOpts,
    body: JSON.stringify(data),
    method: 'PUT'
  });

  if (response.status >= 400) {
    throw new Error('Bad response from server: ' + response.status);
  }

  const json = await response.json();
  return json || null;
}

export function onChange(
  baseUrl: string,
  handler: (change: ChangeSetEntry) => void,
  from: string = ''
): () => void {
  const es = new EventSource(`${baseUrl}/changelog?lastId=${from}`);

  // tslint:disable-next-line: no-object-mutation no-expression-statement
  es.onmessage = e => {
    const { data, lastEventId } = e;

    // tslint:disable-next-line: no-expression-statement
    handler([lastEventId, JSON.parse(data)]);
  };

  return () => es.close();
}
