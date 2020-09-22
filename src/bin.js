#!/usr/bin/env node

'use strict'

const Joi = require('joi')

require('mkg-bin-gen')(
  'deliver-my-forms',
  {
    validator: Joi.any(),
  },
  require('.'),
)
