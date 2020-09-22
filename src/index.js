'use strict'

const Hapi = require('@hapi/hapi')
const CatboxMongoDB = require('catbox-mongodb')
const Joi = require('joi')

const pino = require('pino')
const log = pino({ name: 'deliver-my-forms' })

const Relish = require('relish')({
  messages: {}
})

const init = async (config) => {
  config.hapi.routes = {
      validate: {
        failAction: Relish.failAction
      }
  }

  const server = Hapi.server(config.hapi)

  await server.register({
    plugin: require('hapi-pino'),
    options: { name: 'deliver-my-forms' }
  })

  if (global.SENTRY) {
    await server.register({
      plugin: require('hapi-sentry'),
      options: { client: global.SENTRY }
    })
  }

  await server.register({
    plugin: require('@hapi/inert')
  })

  // main logic
  
  for (const form in config.forms) {
    const formConfig = config.forms[form]
    
    const mailConfig = Object.assign(Object.assign({}, mainMailConfig), formConfig.mail) // we can't prefill defaults with joi in subconfig because default override main so we prefill them in main and clone+override that here
    
    Object.keys(formConfig.fields).reduce((out, field) => {
      const fieldConfig = Object.assign(Object.assign({}, fieldDefault), formConfig.fields[field]) // TODO: prefill defaults with joi
      
      let v
      
      switch(fieldConfig.type) {
        case 'string': {
          v = Joi.string()
          
          if (fieldConfig.required) {
            v = v.required()
          }
          
          if (fieldConfig.maxLen) {
            v = v.maxLength(fieldConfig.maxLen)
          }
          
          if (fieldConfig.minLen) {
            v = v.minLength(fieldConfig.minLen)
          }
        }
        default: {
          throw new TypeError(fieldConfig.type)
        }
      }

      out[field] = v    

      return out
    }, {})
      
    let validator = Joi.object(validatorInner)
    
    if (formConfig.allowGeneric) {
      validator = validator.pattern(/./, Joi.string().minLength(1).maxLength(1024)) // TODO: rethink if string or allow all, but string with def should be good
    }
    
    validator = validator.required()

    await server.route({
      method: 'POST',
      path: 'GET',
      config: {
        validator,
        handler: (h, reply) => {
          const {params} = h
          
          for (const key in params) [
            params[key] = escape(params[key])
          }

          const values = Object.keys(params).reduce((out, key) => {
            out[key.toUpperCase()] = out
          }, {})
          
          if (formConfig.allowGeneric) {
            values._GENERIC = Object.keys(params).filter(key => Boolean(formConfig.fields[key])).reduce(key => `${key}:\n\n${params[key]}`).join('\n\n')
          }
          
          const mail = Object.assign({}, mailConfig)
          
          if (formConfig.text) {
            mail.text = renderTemplate(formConfig.text, values)
          }
          
          if (formConfig.html) {
            mail.html = renderTemplate(formConfig.html, values)
            // TODO: add nodemailer plugin that transforms html to text if no text
          }
          
          const res = await nodemailer.send(mailConfig) // NOTE: this only says "mail is now in queue and being processed" not "it arrived"
          
          return {ok: true, msgId: res.id}  // TODO: should we expose this? it's good for tracking since that's something "an email" can be referred to, but fairly useless to the customer... could be displayed as "keep that" or sth
        }
      }
    })
  }

  function stop() {
    console.log('bla')
  }

  process.on('SIGINT', () => {
    stop()
  })

  process.on('SIGTERM', () => {
    stop()
  })
}

module.exports = init

