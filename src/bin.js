#!/usr/bin/env node

'use strict'

const Joi = require('joi')

require('mkg-bin-gen')(
  'deliver-my-forms',
  {
    validator: Joi.object({
      hapi: Joi.object({
        host: Joi.string().required(),
        port: Joi.number().integer().required(),
      }).pattern(/./, Joi.any()).required(),
      smtp: Joi.object().pattern(/./, Joi.any()).required(),
      mail: Joi.object().pattern(/./, Joi.any()).required(),
      storagePath: Joi.string().required(),
      externalUrl: Joi.string().uri().required(),
      forms: Joi.object().pattern(/^[a-z0-9]+$/mi, Joi.object({
        mail: Joi.object(),
        appendGeneric: Joi.boolean().default(false),
        fields: Joi.object().pattern(/^[a-z0-9]+$/mi, Joi.object({
          type: Joi.string().default('string'),
          required: Joi.boolean().default(false),
          maxLen: Joi.number().integer().default(1024),
          minLen: Joi.number().integer().default(1),
          maxBytes: Joi.number().integer().default(1024 * 1024 * 1024 * 10), // 10mb
        })),
        text: Joi.string(),
        html: Joi.string(),
      })),
    }),
  },
  require('.'),
)
