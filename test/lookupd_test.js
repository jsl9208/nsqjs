const _ = require('lodash')
const nock = require('nock')
const should = require('should')

const lookup = require('../lib/lookupd')

const NSQD_1 = {
  address: 'localhost',
  broadcast_address: 'localhost',
  hostname: 'localhost',
  http_port: 4151,
  remote_address: 'localhost:12345',
  tcp_port: 4150,
  topics: ['sample_topic'],
  version: '0.2.23'
}
const NSQD_2 = {
  address: 'localhost',
  broadcast_address: 'localhost',
  hostname: 'localhost',
  http_port: 5151,
  remote_address: 'localhost:56789',
  tcp_port: 5150,
  topics: ['sample_topic'],
  version: '0.2.23'
}
const NSQD_3 = {
  address: 'localhost',
  broadcast_address: 'localhost',
  hostname: 'localhost',
  http_port: 6151,
  remote_address: 'localhost:23456',
  tcp_port: 6150,
  topics: ['sample_topic'],
  version: '0.2.23'
}
const NSQD_4 = {
  address: 'localhost',
  broadcast_address: 'localhost',
  hostname: 'localhost',
  http_port: 7151,
  remote_address: 'localhost:34567',
  tcp_port: 7150,
  topics: ['sample_topic'],
  version: '0.2.23'
}

const LOOKUPD_1 = '127.0.0.1:4161'
const LOOKUPD_2 = '127.0.0.1:5161'
const LOOKUPD_3 = 'http://127.0.0.1:6161/'
const LOOKUPD_4 = 'http://127.0.0.1:7161/path/lookup'

const nockUrlSplit = url => {
  const match = url.match(/^(https?:\/\/[^/]+)(\/.*$)/i)
  return {
    baseUrl: match[1],
    path: match[2]
  }
}

const registerWithLookupd = (lookupdAddress, nsqd) => {
  const producers = nsqd != null ? [nsqd] : []

  if (nsqd != null) {
    nsqd.topics.forEach(topic => {
      if (lookupdAddress.indexOf('://') === -1) {
        nock(`http://${lookupdAddress}`)
          .get(`/lookup?topic=${topic}`)
          .reply(200, {
            status_code: 200,
            status_txt: 'OK',
            producers
          })
      } else {
        const params = nockUrlSplit(lookupdAddress)
        const { baseUrl } = params
        let { path } = params
        if (!path || path === '/') {
          path = '/lookup'
        }

        nock(baseUrl)
          .get(`${path}?topic=${topic}`)
          .reply(200, {
            status_code: 200,
            status_txt: 'OK',
            producers
          })
      }
    })
  }
}

const setFailedTopicReply = (lookupdAddress, topic) =>
  nock(`http://${lookupdAddress}`)
    .get(`/lookup?topic=${topic}`)
    .reply(200, {
      status_code: 404,
      status_txt: 'TOPIC_NOT_FOUND'
    })

describe('lookupd.lookup', () => {
  afterEach(() => nock.cleanAll())

  describe('querying a single lookupd for a topic', () => {
    it('should return an empty list if no nsqd nodes', done => {
      setFailedTopicReply(LOOKUPD_1, 'sample_topic')

      lookup(LOOKUPD_1, 'sample_topic', (err, nodes) => {
        nodes.should.be.empty()
        done(err)
      })
    })

    it('should return a list of nsqd nodes for a success reply', done => {
      registerWithLookupd(LOOKUPD_1, NSQD_1)

      lookup(LOOKUPD_1, 'sample_topic', (err, nodes) => {
        nodes.should.have.length(1)
        ;[
          'address',
          'broadcast_address',
          'tcp_port',
          'http_port'
        ].forEach(key => {
          should.ok(_.keys(nodes[0]).includes(key))
        })
        done(err)
      })
    })
  })

  describe('querying a multiple lookupd', () => {
    it('should combine results from multiple lookupds', done => {
      registerWithLookupd(LOOKUPD_1, NSQD_1)
      registerWithLookupd(LOOKUPD_2, NSQD_2)
      registerWithLookupd(LOOKUPD_3, NSQD_3)
      registerWithLookupd(LOOKUPD_4, NSQD_4)

      const lookupdAddresses = [LOOKUPD_1, LOOKUPD_2, LOOKUPD_3, LOOKUPD_4]
      lookup(lookupdAddresses, 'sample_topic', (err, nodes) => {
        nodes.should.have.length(4)
        _.chain(nodes)
          .map(n => n['tcp_port'])
          .sort()
          .value()
          .should.be.eql([4150, 5150, 6150, 7150])
        done(err)
      })
    })

    it('should dedupe combined results', done => {
      registerWithLookupd(LOOKUPD_1, NSQD_1)
      registerWithLookupd(LOOKUPD_2, NSQD_1)
      registerWithLookupd(LOOKUPD_3, NSQD_1)
      registerWithLookupd(LOOKUPD_4, NSQD_1)

      const lookupdAddresses = [LOOKUPD_1, LOOKUPD_2, LOOKUPD_3, LOOKUPD_4]
      lookup(lookupdAddresses, 'sample_topic', (err, nodes) => {
        nodes.should.have.length(1)
        done(err)
      })
    })

    return it('should succeed inspite of failures to query a lookupd', done => {
      registerWithLookupd(LOOKUPD_1, NSQD_1)
      nock(`http://${LOOKUPD_2}`)
        .get('/lookup?topic=sample_topic')
        .reply(500)

      const lookupdAddresses = [LOOKUPD_1, LOOKUPD_2]
      lookup(lookupdAddresses, 'sample_topic', (err, nodes) => {
        nodes.should.have.length(1)
        done(err)
      })
    })
  })
})
