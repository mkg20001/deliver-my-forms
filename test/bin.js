'use strict'

const fs = require('fs')
const FormData = require('form-data')
const fetch = require('node-fetch')

const form = new FormData()

async function main() {
  const [formId, ..._kv] = process.argv.slice(2)

  let key

  _kv.forEach((value, index) => {
    if (index % 2) { // uneven=value
      form.append(key, value.startsWith('/') ? fs.readFileSync(value) : value)
    } else { // even=key
      key = value
    }
  })

  console.log(form)

  const rawResponse = await fetch(`http://localhost:4455/${formId}`, {
    method: 'POST',
    body: form,
    headers: form.getHeaders(),
  })

  const res = await rawResponse.json()

  console.log(res)
}

main()
