import * as R from 'ramda'
import Route from 'route-parser'
import Ajv from 'ajv'

const RouteRegexpVisitor: any = require('route-parser/lib/route/visitors/regexp')

const refRoute = new Route('#/definitions/:refName')

function routeToRegexStr(route: any) {
  const { re } = RouteRegexpVisitor.visit(route.ast)
  const reStr = re.toString()

  return reStr.slice(1, reStr.length - 1)
}

export const PERMISSIVE_SCHEMA = {
  Node: {
    title: 'Gun Node',
    description: 'Any node supported by gun',
    $async: true,
    additionalProperties: {
      anyOf: [
        { $ref: '#/definitions/GunEdge' },
        { type: 'null' },
        { type: 'string' },
        { type: 'number' },
        { type: 'boolean' },
        { type: 'object' }
      ]
    },
    soul: {
      pattern: '*soul',
      properties: {
        soul: { type: 'string' }
      },
      required: ['soul']
    }
  }
}

const DEFAULT_SCHEMA = PERMISSIVE_SCHEMA

const compileValidateSoul = (ajv: any) => (schema: any, _parentSchema: any) => {
  const matchSchema = R.dissoc('pattern', schema || {})
  const pattern: string = R.propOr('', 'pattern', schema)
  const route = pattern && new Route(pattern)

  return (data: any, _cPath: any, _parentData: any, keyInParent: any) => {
    const soul = R.pathOr('', ['_', '#'], data)

    if (!soul || !pattern || soul !== keyInParent) return false
    const match = route.match(soul)

    return match ? ajv.compile(matchSchema)(match) : false
  }
}

const compilePropsFromSoul = (propMap: any, parentSchema: any) => {
  const pattern: string = R.pathOr('', ['soul', 'pattern'], parentSchema)
  const route = pattern && new Route(pattern)

  return (data: any) => {
    const soul: string = R.pathOr('', ['_', '#'], data)
    const soulProps = route.match(soul) || {}

    return !R.keysIn(propMap).find(propName => {
      if (!(propName in data)) return false
      return R.prop(propName, soulProps) !== R.prop(R.prop(propName, propMap), data)
    })
  }
}

const compileEdgeMatchesKey = (ajv: any) => (schema: any) => (
  data: any,
  _cPath: any,
  _parentData: any,
  keyInParent: any
) => (schema ? R.prop('#', data) === keyInParent : true)

export function initAjv({ coerceTypes = true, removeAdditional = false, ...config } = {}) {
  const ajv = new Ajv({ coerceTypes, removeAdditional, ...config })

  ajv.addKeyword('soul', { compile: compileValidateSoul(ajv) })
  ajv.addKeyword('edgeMatchesKey', { compile: compileEdgeMatchesKey(ajv) })
  ajv.addKeyword('propsFromSoul', { compile: compilePropsFromSoul })
  return ajv
}

export function createSuppressor({
  init = initAjv,
  id = 'http://example.com/schemas/gun-schema.json',
  jsonSchema = 'http://json-schema.org/draft-07/schema#',
  title = 'Gun Message Schema',
  description = 'A defintion for the gunDB wire protocol',
  definitions: supplied = DEFAULT_SCHEMA
} = {}) {
  const nodeTypes: any[] = []
  const definitions = R.keys(supplied).reduce((defs: any, typeName) => {
    const pattern = R.pathOr('', [typeName, 'soul', 'pattern'], defs)

    if (!pattern) return defs
    const route = new Route(pattern)
    const pathOrRef = (p: string[]) => {
      const val = R.path(p, defs)
      const ref: string = R.propOr('', '$refs', val)
      const refName: string = R.propOr('', 'refName', refRoute.match(ref || ''))

      return refName ? R.propOr('', refName, defs) : val
    }

    nodeTypes.push(typeName)
    return R.compose(
      R.assocPath([typeName, '$async'], true),
      R.assoc(`${typeName}Soul`, {
        type: 'string',
        pattern: routeToRegexStr(route)
      }),
      R.assoc(`${typeName}Edge`, {
        type: 'object',
        additionalProperties: false,
        properties: {
          '#': { $ref: `#/definitions/${typeName}Soul` }
        },
        required: ['#']
      }),
      R.assocPath(
        [typeName, 'required'],
        [...(R.pathOr([], [typeName, 'required'], defs) || []), '_']
      ),
      R.assocPath([typeName, 'properties', '_'], {
        type: 'object',
        allOf: [{ $ref: '#/definitions/GunNodeMeta' }],
        properties: {
          '#': { $ref: `#/definitions/${typeName}Soul` },
          '>': {
            type: 'object',
            properties: R.keys(pathOrRef([typeName, 'properties'])).reduce(
              (props, key) => R.assoc(key, { type: 'number' }, props),
              {}
            ),
            patternProperties: R.keys(pathOrRef([typeName, 'patternProperties'])).reduce(
              (props, key) => R.assoc(key, { type: 'number' }, props),
              {}
            )
          }
        }
      })
    )(defs)
  }, supplied)

  const schema = {
    $id: id,
    $schema: jsonSchema,
    $async: true,
    title,
    description,
    anyOf: [{ $ref: '#/definitions/GunMsg' }],
    definitions: {
      GunMsg: {
        $async: true,
        type: 'object',
        // required: ["#"], // necessary over wire
        additionalProperties: false,
        properties: {
          '#': {
            title: 'Message Identifier',
            description: 'This should be a globally unique identifier',
            type: 'string'
          },
          '##': {
            title: 'Fast Hash Value?',
            description: 'I have no idea how this is calculated',
            type: 'number'
          },
          '@': {
            title: 'Responding To',
            description: 'The message identifier this message is responding to',
            type: 'string'
          },
          '><': {
            title: 'Adjacent Peers',
            description: 'Not really sure how this works',
            type: 'string'
          },
          $: {
            title: '??'
          },
          I: {
            title: '??'
          },
          ok: {
            title: '??',
            description: "Shouldn't actually be sent over wire",
            type: 'boolean'
          },
          how: {
            title: 'Used for debugging',
            description: "Shouldn't actually be sent over wire (but it is)",
            type: 'string'
          },
          mesh: {
            title: '??',
            description: "Shouldn't be sent over wire"
          },
          rad: {
            title: '??',
            description: "Shouldn't be sent over wire"
          },
          user: {
            title: '??',
            description: "I don't think this is supposed to be sent over wire"
          },
          err: {
            anyOf: [{ type: 'null' }, { type: 'string' }]
          },
          leech: {
            title: 'Leech Command',
            description: 'Gun protocol extension added by pistol',
            type: 'boolean'
          },
          ping: {
            title: 'Ping Command',
            description: 'Gun protocol extension added by pistol',
            type: 'boolean'
          },
          get: {
            title: 'Get Command',
            description: 'A request for graph data',
            type: 'object',
            additionalProperties: false,
            properties: {
              '#': {
                description: 'The soul to request data for',
                anyOf: nodeTypes.map(name => ({
                  $ref: `#/definitions/${name}Soul`
                }))
              },
              '.': {
                description: 'Request a single property?',
                type: 'string'
              }
            }
          },
          put: {
            anyOf: [
              {
                $async: true,
                title: 'Put Command',
                description: 'A payload of graph data',
                type: 'object',
                additionalProperties: {
                  anyOf: [
                    ...nodeTypes.map(name => ({
                      $ref: `#/definitions/${name}`
                    })),
                    { type: 'null' }
                  ]
                }
              },
              { type: 'null' }
            ]
          }
        }
      },
      GunChangeStates: {
        type: 'object',
        title: 'Gun Change States',
        description: 'A map of property names to update timestamps',
        patternProperties: {
          '.*': {
            type: 'number'
          }
        }
      },
      GunNodeMeta: {
        title: 'Gun Node Metadata',
        description: 'Change State and soul of a gun node',
        type: 'object',
        additionalProperties: false,
        properties: {
          '#': { title: 'Soul', type: 'string' },
          '>': { $ref: '#/definitions/GunChangeStates' }
        },
        required: ['#', '>']
      },
      GunEdge: {
        type: 'object',
        additionalProperties: false,
        properties: {
          '#': { type: 'string' }
        },
        required: ['#']
      },
      ...definitions
    }
  }
  const ajv = init()

  ajv.addSchema({
    $id: 'schema.json',
    definitions: schema.definitions
  })
  return { schema, validate: ajv.compile(schema) }
}
