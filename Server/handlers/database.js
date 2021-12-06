/*----------------------------------------------------------------
     Resource: vClient (Server)
     Script: handlers: database.js
     Author: vStudio
     Developer(s): Aviril, Mario, Tron
     DOC: 23/11/2021
     Desc: Database Handler
----------------------------------------------------------------*/


/*-----------
-- Imports --
-----------*/

const {databaseServer, isTableExisting, prepareQuery, fetchSoloResult} = require("../servers/database")
const utilityHandler = require("./utility")
const databaseInstances = {
  users: {
    REF: "\"APP_USERS\"",
    prefix: "usr",
    functions: {
      constructor: async function(payload) {
        if (!payload.UID || !payload.username || !payload.DOB) return false
        const preparedQuery = prepareQuery(payload)
        const queryResult = await databaseServer.query(`INSERT INTO ${databaseInstances.users.REF}(${preparedQuery.columns}) VALUES(${preparedQuery.valueIDs})`, preparedQuery.values)
        if (!queryResult) return false

        const dependencies = Object.entries(databaseInstances.users.dependencies)
        for (const dependency in dependencies) {
          await dependencies[dependency][1].functions.constructor(databaseInstances.users.functions.getDependencyRef(dependencies[dependency][0], payload.UID))
        }
        return true
      },

      getDependencyRef: function(dependency, UID) {
        if (!dependency || !databaseInstances.users.dependencies[dependency] || !UID) return false
        return "\"" + databaseInstances.users.prefix + "_" + UID + "_" + databaseInstances.users.dependencies[dependency].prefix + "\""
      },

      isUserExisting: async function(UID, fetchData) {
        if (!UID) return false
        const queryResult = await databaseServer.query(`SELECT * FROM ${databaseInstances.users.REF} WHERE "UID" = '${UID}'`)
        if (fetchData) return fetchSoloResult(queryResult)
        else return (queryResult && (queryResult.rows.length > 0)) || false
      },
    },

    dependencies: {
      contacts: {
        prefix: "cntcs",
        contactTypes: ["friends", "pending", "blocked"],
        functions: {
          constructor: function(REF) {
            return databaseServer.query(`CREATE TABLE IF NOT EXISTS ${REF}("UID" TEXT PRIMARY KEY, "type" TEXT NOT NULL, "group" BIGINT UNIQUE NOT NULL, "DOC" TIMESTAMP WITH TIME ZONE DEFAULT now())`)
          },

          getUserContacts: async function(UID, contactType) {
            if (!await databaseInstances.users.functions.isUserExisting(UID)) return false
            if (!contactType && (databaseInstances.users.dependencies.contacts.contactTypes.indexOf(contactType) == -1)) return false

            if (contactType) {
              var queryResult = await databaseServer.query(`SELECT * FROM ${databaseInstances.users.functions.getDependencyRef("contacts", UID)} WHERE type = '${contactType}'`)
              return (queryResult && (queryResult.rows.length > 0) && queryResult) || false
            }
            var queryResult = await databaseServer.query(`SELECT * FROM ${databaseInstances.users.functions.getDependencyRef("contacts", UID)}`)
            if (queryResult && (queryResult.rows.length > 0)) {
              queryResult = utilityHandler.lodash.groupBy(queryResult.rows, function(contactData) {
                const contactType = contactData.type
                delete contactData.type
                return contactType
              })
            }
            const userContacts = {}
            databaseInstances.users.dependencies.contacts.contactTypes.forEach(function(contactInstance) {
              userContacts[contactInstance] = (queryResult && queryResult[contactInstance]) || {}
            })
            return userContacts
          }
        }
      }
    }
  },

  personalGroups: {
    REF: "\"APP_PERSONAL_GROUPS\"",
    prefix: "prsnlgrp",
    functions: {
      constructor: async function(payload) {
        if (!payload.senderUID || !payload.receiverUID) return false
        var groupRefs = [payload.senderUID + "/" + payload.receiverUID, payload.receiverUID + "/" + payload.senderUID]
        var queryResult = await databaseServer.query(`SELECT * FROM ${databaseInstances.personalGroups.REF} WHERE "REF" IN ('${groupRefs[0]}', '${groupRefs[1]}')`)
        queryResult = fetchSoloResult(queryResult)
        if (queryResult) return queryResult.UID

        payload = {
          REF: groupRefs[0]
        }
        const preparedQuery = prepareQuery(payload)
        queryResult = await databaseServer.query(`INSERT INTO ${databaseInstances.personalGroups.REF}(${preparedQuery.columns}) VALUES(${preparedQuery.valueIDs}) RETURNING *`, preparedQuery.values)
        queryResult = fetchSoloResult(queryResult)
        if (!queryResult) return queryResult.UID
        payload.UID = queryResult.UID
        const dependencies = Object.entries(databaseInstances.personalGroups.dependencies)
        for (const dependency in dependencies) {
          await dependencies[dependency][1].functions.constructor(databaseInstances.personalGroups.functions.getDependencyRef(dependencies[dependency][0], payload.UID))
        }
        return payload.UID
      },

      getDependencyRef: function(dependency, UID) {
        if (!dependency || !databaseInstances.personalGroups.dependencies[dependency] || !UID) return false
        return "\"" + databaseInstances.personalGroups.prefix + "_" + UID + "_" + databaseInstances.personalGroups.dependencies[dependency].prefix + "\""
      },

      isGroupExisting: async function(UID) {
        if (!UID) return false
        const queryResult = await databaseServer.query(`SELECT * FROM ${databaseInstances.personalGroups.REF} WHERE "UID" = '${UID}'`)
        return (queryResult && queryResult.rows.length > 0) || false
      },
    },

    dependencies: {
      messages: {
        prefix: "msgs",
        functions: {
          constructor: function(REF) {
            return databaseServer.query(`CREATE TABLE IF NOT EXISTS ${REF}("UID" BIGSERIAL PRIMARY KEY, "message" TEXT NOT NULL, "owner" TEXT NOT NULL, "DOC" TIMESTAMP WITH TIME ZONE DEFAULT now())`)
          }
        }
      }
    }
  },

  privateGroups: {
    REF: "\"APP_PRIVATE_GROUPS\"",
    prefix: "prvtgrp"
  },

  publicGroups: {
    REF: "\"APP_PUBLIC_GROUPS\"",
    prefix: "pblcgrp"
  },

  serverGroups: {
    REF: "\"APP_SERVER_GROUPS\"",
    prefix: "srvrgrp"
  }
}
databaseServer.query(`CREATE TABLE IF NOT EXISTS ${databaseInstances.users.REF}("UID" TEXT PRIMARY KEY, "username" TEXT NOT NULL, "DOB" JSON NOT NULL, "DOC" TIMESTAMP WITH TIME ZONE DEFAULT now())`)
databaseServer.query(`CREATE TABLE IF NOT EXISTS ${databaseInstances.personalGroups.REF}("UID" BIGSERIAL PRIMARY KEY, "REF" TEXT UNIQUE NOT NULL, "DOC" TIMESTAMP WITH TIME ZONE DEFAULT now())`)
databaseServer.query(`CREATE TABLE IF NOT EXISTS ${databaseInstances.publicGroups.REF}("UID" BIGSERIAL PRIMARY KEY, "DOC" TIMESTAMP WITH TIME ZONE DEFAULT now())`)
databaseServer.query(`CREATE TABLE IF NOT EXISTS ${databaseInstances.serverGroups.REF}("UID" BIGSERIAL PRIMARY KEY, "DOC" TIMESTAMP WITH TIME ZONE DEFAULT now())`)

module.exports = {
  server: databaseServer,
  instances: databaseInstances,
  isTableExisting,
  prepareQuery,
  fetchSoloResult
}