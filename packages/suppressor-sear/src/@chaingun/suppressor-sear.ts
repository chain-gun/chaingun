/* globals Promise */
import * as R from 'ramda'
import Route from 'route-parser'

const {
  PERMISSIVE_SCHEMA: GUN_PERMISSIVE_SCHEMA,
  initAjv: ajvBaseInit
} = require('@chaingun/suppressor')

const MAX_AUTHOR_ALIAS_SIZE = 512
const MAX_AUTHOR_ID_SIZE = 128 // ???
const authorPattern = '~:authorId'
const seaAuthorRoute = new Route(authorPattern)
const seaSoulRoute = new Route('*stuff~:authorId.')

export const AUTH_SCHEMA = {
  seaAlias: { type: 'string', maxLength: MAX_AUTHOR_ALIAS_SIZE },
  SEAAlias: {
    title: 'Gun SEA Alias',
    $async: true,
    soul: {
      pattern: '~@:alias',
      properties: {
        alias: { $ref: 'schema.json#/definitions/seaAlias' }
      },
      required: ['alias']
    },
    additionalProperties: {
      edgeMatchesKey: true,
      anyOf: [{ $ref: '#/definitions/SEAAuthorEdge' }]
    }
  },
  seaAuthorId: { type: 'string', maxLength: MAX_AUTHOR_ID_SIZE },
  seaAuthObj: {
    oneOf: [
      {
        type: 'object',
        properties: {
          ek: {
            type: 'object',
            properties: {
              ct: { type: 'string' },
              iv: { type: 'string' },
              s: { type: 'string' }
            }
          },
          s: { type: 'string' }
        }
      },
      {
        type: 'string'
      }
    ]
  },
  SEAAuthor: {
    title: 'Gun SEA Author',
    $async: true,
    properties: {
      pub: { $ref: '#/definitions/seaAuthorId' },
      epub: { sea: { type: 'string' } },
      alias: { sea: { $ref: 'schema.json#/definitions/seaAlias' } },
      auth: {
        sea: { $ref: 'schema.json#/definitions/seaAuthObj' }
      }
    },
    additionalProperties: {
      sea: {
        anyOf: [
          { $ref: 'schema.json#/definitions/GunEdge' },
          { $ref: 'schema.json#/definitions/seaAuthObj' },
          { type: 'null' },
          { type: 'string' },
          { type: 'number' },
          { type: 'boolean' }
        ]
      }
    },
    soul: {
      pattern: authorPattern,
      properties: {
        authorId: { $ref: 'schema.json#/definitions/seaAuthorId' }
      },
      required: ['authorId']
    }
  }
}

export const PERMISSIVE_NODE_SCHEMA = {
  title: 'Gun SEA Node',
  description: 'Any SEA node supported by gun',
  $async: true,

  soul: {
    pattern: '*path~:authorId.',
    properties: {
      path: { type: 'string' },
      authorId: { $ref: 'schema.json#/definitions/seaAuthorId' }
    },
    required: ['path', 'authorId']
  },

  additionalProperties: {
    '.*': {
      sea: {
        anyOf: [
          { $ref: 'schema.json#/definitions/GunNodeMeta' },
          { $ref: 'schema.json#/definitions/GunEdge' },
          { type: 'null' },
          { type: 'string' },
          { type: 'number' },
          { type: 'boolean' }
        ]
      }
    }
  }
}

export const PERMISSIVE_SCHEMA = {
  ...AUTH_SCHEMA,
  SEANode: PERMISSIVE_NODE_SCHEMA,
  ...GUN_PERMISSIVE_SCHEMA
}

export const read = (Gun: any, data: any, key: string, pair: boolean | string = false) => {
  const packed = Gun.SEA.opt.pack(data[key], key, data, R.path(['_', '#'], data))

  return Gun.SEA.verify(packed, pair).then((r: any) => {
    if (typeof r === 'undefined') {
      throw new Error('invalid sea data')
    }
    return Gun.SEA.opt.unpack(r, key, data)
  })
}

const validateSeaProperty = (Gun: any, ajv: any) => (
  schema: any,
  data: any,
  pSchema: any,
  _cPath: any,
  parentData: any,
  keyInParent: string
) => {
  const soul: string = R.pathOr('', ['_', '#'], parentData)

  if (keyInParent === '_') return true
  const authorId: string = R.propOr(
    '',
    'authorId',
    seaSoulRoute.match(soul) || seaAuthorRoute.match(soul)
  )

  if (!authorId) return false
  if (soul === `~${authorId}` && keyInParent === 'pub') {
    return data === authorId
  }

  // Validate as an object to give property validators more context
  const validate = ajv.compile({
    additionalProperties: true,
    properties: {
      [keyInParent]: schema
    }
  })
  let result: any

  return read(Gun, parentData, keyInParent, authorId)
    .then((res: any) => (result = res))
    .then((res: any) => R.assoc(keyInParent, res, parentData))
    .catch((err: any) => {
      console.error(
        'key err',
        soul,
        keyInParent,
        authorId,
        parentData[keyInParent],
        err.stack || err
      )
      return false
    })
    .then((res: any) => {
      if (!res || typeof res[keyInParent] === 'undefined') {
        delete parentData[keyInParent]
        delete (R.path(['_', '>'], parentData) || ({} as any))[keyInParent]
        console.error('sea prop err', soul, keyInParent, result, pSchema)
        return res
      }
      return Promise.resolve(validate(res)).then(isValid => {
        if (!isValid) {
          console.error('sea validation err', soul, keyInParent, result, validate.errors, pSchema)
        }
        return isValid
      })
    })
}

export const initAjv = (conf: any, Gun: any = R.propOr(null, 'Gun', global)) =>
  R.compose(
    (ajv: any) => {
      ajv.addKeyword('sea', {
        async: true,
        modifying: true,
        validate: validateSeaProperty(Gun, ajv)
      })
      return ajv
    },
    ajvBaseInit,
    R.always(conf)
  )()
