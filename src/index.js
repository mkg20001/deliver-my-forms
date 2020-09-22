'use strict'

/* eslint-disable guard-for-in */
/* eslint-disable no-loop-func */

const Hapi = require('@hapi/hapi')
const Joi = require('joi')

const pino = require('pino')
const log = pino({name: 'deliver-my-forms'})

const Relish = require('relish')({
  messages: {},
})

const nodemailer = require('nodemailer')
const htmlToText = require('nodemailer-html-to-text').htmlToText

const fieldDefault = {
  type: 'string',
  required: false,
  maxLength: 1024,
  minLength: 1,
}

function renderTemplate(str, values) {
  return str.replace(/\$([_A-Z0-9]+)/gi, (_, name) => values[name.toUpperCase()] || '(not provided)')
}

const init = async config => {
  config.hapi.routes = {
    validate: {
      failAction: Relish.failAction,
    },
  }

  function handleField(config, key, value) {
    switch (config.type) {
    case 'string': {
      return value
    }

    case 'file': {
      break
    }

    default: {
      throw new TypeError(config.type)
    }
    }
  }

  const mailer = nodemailer.createTransport(config.smtp)
  mailer.use('compile', htmlToText({})) // TODO: allow specifying options for htmlToText?

  const mainMailConfig = config.mail

  const server = Hapi.server(config.hapi)

  await server.register({
    plugin: require('hapi-pino'),
    options: {name: 'deliver-my-forms'},
  })

  if (global.SENTRY) {
    await server.register({
      plugin: require('hapi-sentry'),
      options: {client: global.SENTRY},
    })
  }

  await server.register({
    plugin: require('@hapi/inert'),
  })

  // main logic

  for (const form in config.forms) {
    const formConfig = config.forms[form]

    const mailConfig = Object.assign(Object.assign({}, mainMailConfig), formConfig.mail) // we can't prefill defaults with joi in subconfig because default override main so we prefill them in main and clone+override that here

    const validatorInner = Object.keys(formConfig.fields).reduce((out, field) => {
      const fieldConfig = formConfig.fields[field] // TODO: prefill defaults with joi

      let v

      switch (fieldConfig.type) {
      case 'string': {
        v = Joi.string()

        if (fieldConfig.required) {
          v = v.required()
        }

        if (fieldConfig.maxLen) {
          v = v.max(fieldConfig.maxLen)
        }

        if (fieldConfig.minLen) {
          v = v.min(fieldConfig.minLen)
        }
        break
      }

      case 'file': {
        v = Joi.any() // TOOD: add file validator
        break
      }

      default: {
        throw new TypeError(fieldConfig.type)
      }
      }

      out[field] = v

      return out
    }, {})

    let validator = Joi.object(validatorInner)

    if (formConfig.appendGeneric) {
      validator = validator.pattern(/./, Joi.string().min(1).max(1024)) // TODO: rethink if string or allow all, but string with def should be good
    }

    validator = validator.required()

    await server.route({
      method: 'POST',
      path: '/' + form,
      config: {
        /* payload: {
          maxBytes: 209715200,
          output: 'stream',
          parse: true,
        }, */
        handler: async (h, reply) => {
          const {payload: params} = h

          for (const key in params) {
            params[key] = escape(params[key])
          }

          const values = Object.keys(params).reduce((out, key) => {
            out[key.toUpperCase()] = handleField(formConfig.fields[key] || fieldDefault, key, params[key])

            return out
          }, {})

          if (formConfig.appendGeneric) {
            values._GENERIC = Object.keys(params).filter(key => Boolean(formConfig.fields[key])).map(key => `${key}:\n\n${params[key]}`).join('\n\n')
          }

          const mail = Object.assign({}, mailConfig)

          if (formConfig.text) {
            mail.text = formConfig.text
          }

          if (formConfig.html) {
            mail.html = formConfig.html
            // TODO: add nodemailer plugin that transforms html to text if no text
          }

          // NOTE: html fallback is already covered by plugin

          // render all keys, including subject
          for (const key in mail) {
            mail[key] = renderTemplate(mail[key], values)
          }

          if (!mail.html) {
            mail.html = mail.text.replace(/(\r\n|\n)/g, '<br>') // fallback
          }

          const res = await mailer.sendMail(mail) // NOTE: this only says "mail is now in queue and being processed" not "it arrived"

          return {ok: true, msgId: res.id}  // TODO: should we expose this? it's good for tracking since that's something "an email" can be referred to, but fairly useless to the customer... could be displayed as "keep that" or sth
        },
        validate: {
          payload: validator,
        },
      },
    })
  }

  async function stop() {
    await server.stop()
  }

  await server.start()

  process.on('SIGINT', () => {
    stop()
  })

  process.on('SIGTERM', () => {
    stop()
  })
}

module.exports = init
