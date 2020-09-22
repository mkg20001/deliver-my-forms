'use strict'

const [form, ..._kv] = process.argv.slice(2)

const kv = _kv.reduce((out, k) => {
  out[k] = _kv[k]

  return out
}, {})

const fetch = require('node-fetch')

async function main() {
  const rawResponse = await fetch(`http://localhost:4455/${form}`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(kv),
  })

  const res = await rawResponse.json()

  console.log(res)
}

main()
