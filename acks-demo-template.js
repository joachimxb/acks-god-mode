// Auto-generated from Templates/v2-established-march.acks.json, then run through
// ACKS.migrateCampaign so the shipped demo matches exactly what the loader produces
// (WIS->WIL, settlement entryways/regulatedAssets -> [], v1-scope reservations, typed
// eventLog, Wave Construction-B agricultural Projects, Phase 2.5 Journeys hex/character
// fields). Regenerated 2026-06-01 (Journeys J1) - migrateCampaign is a no-op on this
// file, asserted by tests/smoke.js. Exposes window.ACKS_DEMO_TEMPLATE.
(function(global){
  global.ACKS_DEMO_TEMPLATE = {
  "schemaVersion": 2,
  "kind": "campaign",
  "id": "cmp-saltspur-march-demo",
  "name": "March of Saltspur (v2 demo)",
  "createdAt": "2026-05-26",
  "lastModifiedAt": "2026-05-26",
  "currentTurn": 5,
  "calendar": {
    "year": null,
    "month": null,
    "day": null,
    "season": null
  },
  "houseRules": {
    "families-per-hex-tracking": true
  },
  "campaignContext": {
    "theme": "Established march with vassal baronies",
    "tone": "Settled but still frontier-conscious — the march guards the realm's edge",
    "season": "",
    "aiNotes": "Mid-tier vassalage demo. Marquis Aelric directly administers the March's heart and receives tribute from two vassal Barons (Yorick of Northwatch and Lady Mira of Saltcombe). Demonstrates one tier of vassalage with auto-tribute flow."
  },
  "domains": [
    {
      "schemaVersion": 2,
      "kind": "domain",
      "id": "dom-march-of-saltspur",
      "name": "March of Saltspur",
      "createdAt": "2026-05-26",
      "lastModifiedAt": "2026-05-26",
      "type": "rural",
      "classification": "Borderlands",
      "tags": [
        "march",
        "borderlands",
        "seat-of-realm"
      ],
      "rulerCharacterId": "chr-marquis-aelric",
      "administersThisMonth": false,
      "liegeId": null,
      "vassalIds": [
        "dom-barony-northwatch",
        "dom-barony-saltcombe"
      ],
      "isRealm": true,
      "geography": {
        "hexMapId": null,
        "primaryHex": {
          "q": 0,
          "r": 0
        },
        "hexScale": "6-mile",
        "controlledHexes": 8,
        "claimedHexes": 12,
        "controlledHexList": [],
        "hexes": [
          {
            "schemaVersion": 2,
            "id": "hex-saltspur-keep",
            "coord": {
              "q": 0,
              "r": 0
            },
            "classification": "Borderlands",
            "explored": true,
            "families": 180,
            "valuePerFamily": 7,
            "landImprovementBonus": 1,
            "landImprovementProjects": [],
            "terrain": "plains",
            "primaryStructure": "Saltspur Keep (Marquis's seat)",
            "settlement": {
              "schemaVersion": 2,
              "id": "set-saltspur-town",
              "name": "Saltspur",
              "families": 220,
              "totalInvestment": 30000,
              "foundedTurn": 1,
              "foundedByCharacterId": null,
              "demandModifiers": {
                "salt": -2,
                "grain-vegetables": -1,
                "spices": 1
              },
              "rumors": [],
              "entryways": null,
              "regulatedAssets": null,
              "notes": "Class V market town clustered around the keep. Famous for the salt pans on the coast."
            },
            "lairs": [],
            "dungeons": [],
            "pointsOfInterest": [],
            "monsterNotes": "",
            "notes": "Seat of the March. Town and keep share the hex."
          },
          {
            "schemaVersion": 2,
            "id": "hex-saltspur-fields",
            "coord": {
              "q": 1,
              "r": 0
            },
            "classification": "Borderlands",
            "explored": true,
            "families": 224,
            "valuePerFamily": 7,
            "landImprovementBonus": 0,
            "landImprovementProjects": [
              {
                "id": "lip-2t8kgh9",
                "schemaVersion": 2,
                "targetBonus": 1,
                "monthlyContribution": 800,
                "accumulated": 1600,
                "startedTurn": 3,
                "supervisors": [
                  {
                    "characterId": "chr-05qogak",
                    "monthsLeft": 4
                  }
                ],
                "notes": "Drainage works in the western fields — financed in part by the Saltspur Distillery to expand barley supply."
              }
            ],
            "terrain": "plains",
            "primaryStructure": "",
            "settlement": null,
            "lairs": [],
            "dungeons": [],
            "pointsOfInterest": [],
            "monsterNotes": "",
            "notes": "Grain country. The march's breadbasket."
          },
          {
            "schemaVersion": 2,
            "id": "hex-saltpans",
            "coord": {
              "q": 0,
              "r": 1
            },
            "classification": "Borderlands",
            "explored": true,
            "families": 144,
            "valuePerFamily": 8,
            "landImprovementBonus": 0,
            "landImprovementProjects": [],
            "terrain": "coast",
            "primaryStructure": "Salt-pan complex",
            "settlement": null,
            "lairs": [],
            "dungeons": [],
            "pointsOfInterest": [
              {
                "schemaVersion": 2,
                "id": "poi-salt-pans",
                "name": "Saltspur Pans",
                "kind": "industry",
                "description": "The pans that gave the march its name. Tariff revenue is significant."
              }
            ],
            "monsterNotes": "",
            "notes": "Source of the march's salt wealth and identity."
          },
          {
            "schemaVersion": 2,
            "id": "hex-coastal-march",
            "coord": {
              "q": -1,
              "r": 1
            },
            "classification": "Borderlands",
            "explored": true,
            "families": 112,
            "valuePerFamily": 6,
            "landImprovementBonus": 0,
            "landImprovementProjects": [],
            "terrain": "coast",
            "primaryStructure": "",
            "settlement": null,
            "lairs": [],
            "dungeons": [],
            "pointsOfInterest": [],
            "monsterNotes": "",
            "notes": "Fishing villages along the coast."
          }
        ],
        "terrain": "coastal plains",
        "features": []
      },
      "demographics": {
        "peasantFamilies": 480,
        "urbanFamilies": 220,
        "morale": 1,
        "moraleNotes": "The March is well-governed and prosperous; morale is slightly positive."
      },
      "treasury": {
        "gp": 18000
      },
      "income": {
        "landRevenuePerFamily": 7,
        "serviceRevenuePerFamily": 4,
        "taxPerFamily": 2,
        "tributesIn": [
          {
            "fromDomainId": "dom-barony-northwatch",
            "amount": 0
          },
          {
            "fromDomainId": "dom-barony-saltcombe",
            "amount": 0
          }
        ],
        "tariffs": 280,
        "urbanRevenue": 0,
        "other": []
      },
      "expenses": {
        "garrisonMonthly": 0,
        "liturgyPerFamily": 1,
        "tithesOut": [],
        "titheMonthly": 0,
        "tithePaid": true,
        "strongholdMaintenance": 0,
        "personalExpenses": 0,
        "tributeToLiege": 0,
        "tributeAuto": false,
        "tributePct": 0,
        "tributePaid": true,
        "other": []
      },
      "taxPolicy": {
        "rate": "standard",
        "moraleImpact": 0
      },
      "garrison": {
        "units": [
          {
            "schemaVersion": 2,
            "id": "gar-saltspur-foot",
            "displayName": "Heavy Infantry",
            "unitTypeKey": "heavy-infantry",
            "count": 60,
            "monthlyWage": 12,
            "brPerSoldier": 0.083,
            "stationedAtHexId": "hex-saltspur-keep"
          },
          {
            "schemaVersion": 2,
            "id": "gar-saltspur-bows",
            "displayName": "Bowmen",
            "unitTypeKey": "bowmen",
            "count": 30,
            "monthlyWage": 9,
            "brPerSoldier": 0.063,
            "stationedAtHexId": "hex-saltspur-keep"
          },
          {
            "schemaVersion": 2,
            "id": "gar-saltspur-horse",
            "displayName": "Medium Cavalry",
            "unitTypeKey": "medium-cavalry",
            "count": 20,
            "monthlyWage": 25,
            "brPerSoldier": 0.15,
            "stationedAtHexId": "hex-saltspur-keep"
          }
        ],
        "totalMonthlyCost": 1490,
        "totalBR": 9.99
      },
      "stronghold": {
        "type": "Castle (small)",
        "buildValue": 75000,
        "maintenancePerMonth": 31,
        "garrisonCapacity": 200,
        "structures": [
          {
            "schemaVersion": 2,
            "id": "str-saltspur-keep",
            "structureKey": "keep-stone",
            "quantity": 1,
            "notes": "Saltspur Keep — stone keep with curtain wall and gatehouse."
          }
        ]
      },
      "specialists": [],
      "henchmenCharacterIds": [
        "chr-sir-tomas-castellan"
      ],
      "urban": {
        "marketClass": "V",
        "totalInvestment": 30000,
        "investments": [],
        "demandModifiers": {}
      },
      "pendingPlayerInput": null,
      "warfare": {
        "stationedArmyIds": [],
        "supplyDepots": [],
        "fortifications": [],
        "siegeStatus": null
      },
      "council": null,
      "history": [],
      "notes": "The march itself. Aelric directly administers the central hexes; his two vassal barons hold the rest.",
      "magistrates": {
        "captainOfGuard": {
          "characterId": "chr-sir-tomas-castellan",
          "administersThisMonth": false
        },
        "chaplain": {
          "characterId": "chr-brother-cassian",
          "administersThisMonth": false
        },
        "munerator": {
          "characterId": null,
          "administersThisMonth": false
        },
        "steward": {
          "characterId": null,
          "administersThisMonth": false
        }
      }
    },
    {
      "schemaVersion": 2,
      "kind": "domain",
      "id": "dom-barony-northwatch",
      "name": "Barony of Northwatch",
      "createdAt": "2026-05-26",
      "lastModifiedAt": "2026-05-26",
      "type": "rural",
      "classification": "Borderlands",
      "tags": [
        "barony",
        "vassal",
        "border"
      ],
      "rulerCharacterId": "chr-baron-yorick",
      "administersThisMonth": false,
      "liegeId": "dom-march-of-saltspur",
      "vassalIds": [],
      "isRealm": false,
      "geography": {
        "hexMapId": null,
        "primaryHex": {
          "q": 0,
          "r": -2
        },
        "hexScale": "6-mile",
        "controlledHexes": 4,
        "claimedHexes": 5,
        "controlledHexList": [],
        "hexes": [
          {
            "schemaVersion": 2,
            "id": "hex-northwatch-tower",
            "coord": {
              "q": 0,
              "r": -2
            },
            "classification": "Borderlands",
            "explored": true,
            "families": 80,
            "valuePerFamily": 6,
            "landImprovementBonus": 0,
            "landImprovementProjects": [],
            "terrain": "hills",
            "primaryStructure": "Tower of Northwatch",
            "settlement": {
              "schemaVersion": 2,
              "id": "set-northwatch-village",
              "name": "Northwatch Village",
              "families": 60,
              "totalInvestment": 5000,
              "foundedTurn": 1,
              "foundedByCharacterId": null,
              "demandModifiers": {},
              "rumors": [],
              "entryways": null,
              "regulatedAssets": null,
              "notes": "A market hamlet under the tower's walls."
            },
            "lairs": [],
            "dungeons": [],
            "pointsOfInterest": [],
            "monsterNotes": "",
            "notes": "Yorick's seat. Forward-watchtower against the wastes."
          },
          {
            "schemaVersion": 2,
            "id": "hex-northwatch-farms",
            "coord": {
              "q": 1,
              "r": -2
            },
            "classification": "Borderlands",
            "explored": true,
            "families": 135,
            "valuePerFamily": 6,
            "landImprovementBonus": 0,
            "landImprovementProjects": [],
            "terrain": "plains",
            "primaryStructure": "",
            "settlement": null,
            "lairs": [],
            "dungeons": [],
            "pointsOfInterest": [],
            "monsterNotes": "",
            "notes": "Mixed farmland."
          }
        ],
        "terrain": "hills",
        "features": []
      },
      "demographics": {
        "peasantFamilies": 135,
        "urbanFamilies": 60,
        "morale": 0,
        "moraleNotes": ""
      },
      "treasury": {
        "gp": 1200
      },
      "income": {
        "landRevenuePerFamily": 6,
        "serviceRevenuePerFamily": 4,
        "taxPerFamily": 2,
        "tributesIn": [],
        "tariffs": 0,
        "urbanRevenue": 0,
        "other": []
      },
      "expenses": {
        "garrisonMonthly": 0,
        "liturgyPerFamily": 1,
        "tithesOut": [],
        "titheMonthly": 0,
        "tithePaid": true,
        "strongholdMaintenance": 0,
        "personalExpenses": 0,
        "tributeToLiege": 0,
        "tributeAuto": true,
        "tributePct": 10,
        "tributePaid": true,
        "other": []
      },
      "taxPolicy": {
        "rate": "standard",
        "moraleImpact": 0
      },
      "garrison": {
        "units": [
          {
            "schemaVersion": 2,
            "id": "gar-northwatch-foot",
            "displayName": "Light Infantry",
            "unitTypeKey": "light-infantry",
            "count": 25,
            "monthlyWage": 6,
            "brPerSoldier": 0.034,
            "stationedAtHexId": "hex-northwatch-tower"
          },
          {
            "schemaVersion": 2,
            "id": "gar-northwatch-bows",
            "displayName": "Bowmen",
            "unitTypeKey": "bowmen",
            "count": 10,
            "monthlyWage": 9,
            "brPerSoldier": 0.063,
            "stationedAtHexId": "hex-northwatch-tower"
          }
        ],
        "totalMonthlyCost": 240,
        "totalBR": 1.48
      },
      "stronghold": {
        "type": "Tower",
        "buildValue": 15000,
        "maintenancePerMonth": 0,
        "garrisonCapacity": 60,
        "structures": [
          {
            "schemaVersion": 2,
            "id": "str-northwatch-tower",
            "structureKey": "tower-small-round",
            "quantity": 1,
            "notes": "Tower of Northwatch — three stories, stone construction."
          }
        ]
      },
      "specialists": [],
      "henchmenCharacterIds": [],
      "urban": {
        "marketClass": "VI",
        "totalInvestment": 5000,
        "investments": [],
        "demandModifiers": {}
      },
      "pendingPlayerInput": null,
      "warfare": {
        "stationedArmyIds": [],
        "supplyDepots": [],
        "fortifications": [],
        "siegeStatus": null
      },
      "council": null,
      "history": [],
      "notes": "Yorick's barony. Owes ~10% tribute to the March monthly."
    },
    {
      "schemaVersion": 2,
      "kind": "domain",
      "id": "dom-barony-saltcombe",
      "name": "Barony of Saltcombe",
      "createdAt": "2026-05-26",
      "lastModifiedAt": "2026-05-26",
      "type": "rural",
      "classification": "Civilized",
      "tags": [
        "barony",
        "vassal",
        "priestly"
      ],
      "rulerCharacterId": "chr-baroness-mira",
      "administersThisMonth": false,
      "liegeId": "dom-march-of-saltspur",
      "vassalIds": [],
      "isRealm": false,
      "geography": {
        "hexMapId": null,
        "primaryHex": {
          "q": -2,
          "r": 1
        },
        "hexScale": "6-mile",
        "controlledHexes": 3,
        "claimedHexes": 3,
        "controlledHexList": [],
        "hexes": [
          {
            "schemaVersion": 2,
            "id": "hex-saltcombe-shrine",
            "coord": {
              "q": -2,
              "r": 1
            },
            "classification": "Civilized",
            "explored": true,
            "families": 100,
            "valuePerFamily": 6,
            "landImprovementBonus": 0,
            "landImprovementProjects": [],
            "terrain": "coast",
            "primaryStructure": "Shrine-Chapter of the Salt Saint",
            "settlement": {
              "schemaVersion": 2,
              "id": "set-saltcombe-town",
              "name": "Saltcombe Town",
              "families": 90,
              "totalInvestment": 8000,
              "foundedTurn": 1,
              "foundedByCharacterId": null,
              "demandModifiers": {
                "salt": -1
              },
              "rumors": [],
              "entryways": null,
              "regulatedAssets": null,
              "notes": "A small priestly town built around the shrine."
            },
            "lairs": [],
            "dungeons": [],
            "pointsOfInterest": [
              {
                "schemaVersion": 2,
                "id": "poi-salt-saint",
                "name": "Shrine of the Salt Saint",
                "kind": "temple",
                "description": "A regional pilgrimage destination. Pilgrims pay a small toll which is logged as tithe income."
              }
            ],
            "monsterNotes": "",
            "notes": "Mira's seat. The shrine is the barony's identity."
          },
          {
            "schemaVersion": 2,
            "id": "hex-saltcombe-fields",
            "coord": {
              "q": 0,
              "r": 2
            },
            "classification": "Civilized",
            "explored": true,
            "families": 165,
            "valuePerFamily": 6,
            "landImprovementBonus": 0,
            "landImprovementProjects": [],
            "terrain": "plains",
            "primaryStructure": "",
            "settlement": null,
            "lairs": [],
            "dungeons": [],
            "pointsOfInterest": [],
            "monsterNotes": "",
            "notes": "Pilgrim-road farms."
          }
        ],
        "terrain": "coastal plains",
        "features": []
      },
      "demographics": {
        "peasantFamilies": 165,
        "urbanFamilies": 90,
        "morale": 1,
        "moraleNotes": "Faith-driven loyalty to Lady Mira."
      },
      "treasury": {
        "gp": 1800
      },
      "income": {
        "landRevenuePerFamily": 6,
        "serviceRevenuePerFamily": 4,
        "taxPerFamily": 2,
        "tributesIn": [],
        "tariffs": 0,
        "urbanRevenue": 0,
        "other": [
          {
            "label": "Pilgrim offerings",
            "amount": 40
          }
        ]
      },
      "expenses": {
        "garrisonMonthly": 0,
        "liturgyPerFamily": 1,
        "tithesOut": [],
        "titheMonthly": 0,
        "tithePaid": true,
        "strongholdMaintenance": 0,
        "personalExpenses": 0,
        "tributeToLiege": 0,
        "tributeAuto": true,
        "tributePct": 10,
        "tributePaid": true,
        "other": []
      },
      "taxPolicy": {
        "rate": "standard",
        "moraleImpact": 0
      },
      "garrison": {
        "units": [
          {
            "schemaVersion": 2,
            "id": "gar-saltcombe-foot",
            "displayName": "Light Infantry (lay brothers)",
            "unitTypeKey": "light-infantry",
            "count": 20,
            "monthlyWage": 6,
            "brPerSoldier": 0.034,
            "stationedAtHexId": "hex-saltcombe-shrine"
          }
        ],
        "totalMonthlyCost": 120,
        "totalBR": 0.68
      },
      "stronghold": {
        "type": "Shrine-Chapter",
        "buildValue": 18000,
        "maintenancePerMonth": 0,
        "garrisonCapacity": 50,
        "structures": [
          {
            "schemaVersion": 2,
            "id": "str-saltcombe-shrine",
            "structureKey": "chapter-house",
            "quantity": 1,
            "notes": "Stone shrine with attached chapter dormitory."
          }
        ]
      },
      "specialists": [],
      "henchmenCharacterIds": [],
      "urban": {
        "marketClass": "VI",
        "totalInvestment": 8000,
        "investments": [],
        "demandModifiers": {}
      },
      "pendingPlayerInput": null,
      "warfare": {
        "stationedArmyIds": [],
        "supplyDepots": [],
        "fortifications": [],
        "siegeStatus": null
      },
      "council": null,
      "history": [],
      "notes": "Mira's barony. Smallest of the three, but the pilgrim trade keeps it solvent."
    }
  ],
  "characters": [
    {
      "schemaVersion": 2,
      "id": "chr-marquis-aelric",
      "name": "Aelric Bran, Marquis of Saltspur",
      "alignment": "L",
      "race": "human",
      "class": "Fighter",
      "level": 8,
      "xp": 120000,
      "hp": {
        "current": 48,
        "max": 48,
        "hitDice": "8d8"
      },
      "ac": 7,
      "attackThrow": 6,
      "abilities": {
        "STR": 16,
        "INT": 13,
        "DEX": 12,
        "CON": 14,
        "CHA": 15,
        "WIL": 13
      },
      "savingThrows": {
        "paralysis": 8,
        "death": 9,
        "blast": 10,
        "implements": 11,
        "spells": 12
      },
      "proficiencies": [
        "Leadership",
        "Manual of Arms",
        "Diplomacy",
        "Intimidation",
        "Riding"
      ],
      "classPowers": [],
      "henchmanCap": 6,
      "inventory": [],
      "personalGp": 0,
      "currentHexId": "hex-saltspur-keep",
      "currentDomainId": "dom-march-of-saltspur",
      "partyId": null,
      "travelDestination": null,
      "travelPace": "walking",
      "background": "Inherited the March from his father at twenty-six. Has spent fifteen years balancing two vassal barons, the salt trade, and the wastes beyond Northwatch.",
      "personality": "Politic, patient, suspicious of new alliances. Loyal to his vassals as long as they're loyal to him.",
      "goals": [
        "Keep the salt monopoly intact",
        "Renew the oath of Northwatch",
        "See his son knighted next spring"
      ],
      "relationships": [],
      "secrets": "",
      "voice": "Measured, courtly, sparing with humor.",
      "liegeCharacterId": null,
      "loyalty": 0,
      "monthlyWage": 0,
      "upkeepMonthly": 400,
      "honor": [],
      "shame": [],
      "mercantileNetwork": [],
      "earningsLedger": [],
      "history": [],
      "autoAdvance": true,
      "alive": true,
      "deceasedTurn": null,
      "notes": "Realm-holder.",
      "controlledBy": "gm",
      "socialTier": "independent",
      "lifecycleState": "active",
      "creatureTypes": [
        "humanoid"
      ],
      "isEnchantedCreature": false,
      "hitDice": null,
      "heroicCode": null,
      "fatePoints": null,
      "transformationState": null,
      "currentJourneyId": null,
      "personalFatigue": 0,
      "hungerDays": 0,
      "dehydrationDays": 0
    },
    {
      "schemaVersion": 2,
      "id": "chr-sir-tomas-castellan",
      "name": "Sir Tomas, Castellan of Saltspur",
      "alignment": "L",
      "race": "human",
      "class": "Fighter",
      "level": 5,
      "xp": 30000,
      "hp": {
        "current": 30,
        "max": 30,
        "hitDice": "5d8"
      },
      "ac": 5,
      "attackThrow": 9,
      "abilities": {
        "STR": 14,
        "INT": 12,
        "DEX": 13,
        "CON": 12,
        "CHA": 11,
        "WIL": 11
      },
      "savingThrows": {
        "paralysis": 10,
        "death": 11,
        "blast": 12,
        "implements": 13,
        "spells": 14
      },
      "proficiencies": [
        "Manual of Arms",
        "Leadership",
        "Command",
        "Intimidation"
      ],
      "classPowers": [],
      "henchmanCap": 4,
      "inventory": [],
      "personalGp": 0,
      "currentHexId": "hex-saltspur-keep",
      "currentDomainId": "dom-march-of-saltspur",
      "partyId": null,
      "travelDestination": null,
      "travelPace": "walking",
      "background": "Knighted by Aelric after the bandit campaigns. Runs the keep when the Marquis is in the field.",
      "personality": "Practical, direct.",
      "goals": [],
      "relationships": [],
      "secrets": "",
      "voice": "",
      "liegeCharacterId": "chr-marquis-aelric",
      "loyalty": 2,
      "monthlyWage": 100,
      "upkeepMonthly": 120,
      "honor": [],
      "shame": [],
      "mercantileNetwork": [],
      "earningsLedger": [],
      "history": [],
      "autoAdvance": false,
      "alive": true,
      "deceasedTurn": null,
      "notes": "Castellan and right hand.",
      "controlledBy": "gm",
      "socialTier": "henchman",
      "lifecycleState": "active",
      "creatureTypes": [
        "humanoid"
      ],
      "isEnchantedCreature": false,
      "hitDice": null,
      "heroicCode": null,
      "fatePoints": null,
      "transformationState": null,
      "currentJourneyId": null,
      "personalFatigue": 0,
      "hungerDays": 0,
      "dehydrationDays": 0
    },
    {
      "schemaVersion": 2,
      "id": "chr-baron-yorick",
      "name": "Baron Yorick of Northwatch",
      "alignment": "N",
      "race": "human",
      "class": "Fighter",
      "level": 6,
      "xp": 60000,
      "hp": {
        "current": 36,
        "max": 36,
        "hitDice": "6d8"
      },
      "ac": 5,
      "attackThrow": 8,
      "abilities": {
        "STR": 15,
        "INT": 11,
        "DEX": 13,
        "CON": 14,
        "CHA": 11,
        "WIL": 12
      },
      "savingThrows": {
        "paralysis": 9,
        "death": 10,
        "blast": 11,
        "implements": 12,
        "spells": 13
      },
      "proficiencies": [
        "Manual of Arms",
        "Survival",
        "Riding",
        "Intimidation"
      ],
      "classPowers": [],
      "henchmanCap": 4,
      "inventory": [],
      "personalGp": 0,
      "currentHexId": "hex-northwatch-tower",
      "currentDomainId": "dom-barony-northwatch",
      "partyId": null,
      "travelDestination": null,
      "travelPace": "walking",
      "background": "Vassal to the Marquis since his investiture twelve years ago. Has fought three skirmishes against wasteland raiders.",
      "personality": "Gruff, soldierly, occasionally chafes at his oath but has never broken it.",
      "goals": [
        "Push the wastes back another hex",
        "Marry his daughter into Saltspur's household"
      ],
      "relationships": [
        {
          "characterId": "chr-marquis-aelric",
          "kind": "liege",
          "notes": "Sworn vassal."
        }
      ],
      "secrets": "",
      "voice": "Blunt, soldierly.",
      "liegeCharacterId": "chr-marquis-aelric",
      "loyalty": 0,
      "monthlyWage": 240,
      "upkeepMonthly": 200,
      "honor": [],
      "shame": [],
      "mercantileNetwork": [],
      "earningsLedger": [],
      "history": [],
      "autoAdvance": true,
      "alive": true,
      "deceasedTurn": null,
      "notes": "Vassal of the Marquis. Independent ruler of his own barony.",
      "controlledBy": "gm",
      "socialTier": "henchman",
      "lifecycleState": "active",
      "creatureTypes": [
        "humanoid"
      ],
      "isEnchantedCreature": false,
      "hitDice": null,
      "heroicCode": null,
      "fatePoints": null,
      "transformationState": null,
      "currentJourneyId": null,
      "personalFatigue": 0,
      "hungerDays": 0,
      "dehydrationDays": 0
    },
    {
      "schemaVersion": 2,
      "id": "chr-baroness-mira",
      "name": "Lady Mira of Saltcombe",
      "alignment": "L",
      "race": "human",
      "class": "Cleric",
      "level": 6,
      "xp": 50000,
      "hp": {
        "current": 28,
        "max": 28,
        "hitDice": "6d6"
      },
      "ac": 4,
      "attackThrow": 9,
      "abilities": {
        "STR": 11,
        "INT": 13,
        "DEX": 11,
        "CON": 13,
        "CHA": 14,
        "WIL": 16
      },
      "savingThrows": {
        "paralysis": 9,
        "death": 8,
        "blast": 11,
        "implements": 7,
        "spells": 9
      },
      "proficiencies": [
        "Theology",
        "Healing",
        "Leadership",
        "Mystic Aura"
      ],
      "classPowers": [
        "Turn undead",
        "Cast divine spells"
      ],
      "henchmanCap": 5,
      "inventory": [],
      "personalGp": 0,
      "currentHexId": "hex-saltcombe-shrine",
      "currentDomainId": "dom-barony-saltcombe",
      "partyId": null,
      "travelDestination": null,
      "travelPace": "walking",
      "background": "A former priestess of the Salt Saint who inherited the barony from her brother. She runs the shrine and the barony together.",
      "personality": "Calm, devout, calculating in defense of her flock.",
      "goals": [
        "Expand the pilgrim road",
        "Found a chapter-house second to the shrine"
      ],
      "relationships": [
        {
          "characterId": "chr-marquis-aelric",
          "kind": "liege",
          "notes": "Sworn vassal."
        }
      ],
      "secrets": "",
      "voice": "Soft, deliberate.",
      "liegeCharacterId": "chr-marquis-aelric",
      "loyalty": 0,
      "monthlyWage": 200,
      "upkeepMonthly": 180,
      "honor": [],
      "shame": [],
      "mercantileNetwork": [],
      "earningsLedger": [],
      "history": [],
      "autoAdvance": true,
      "alive": true,
      "deceasedTurn": null,
      "notes": "Vassal of the Marquis. Cleric-baron, the only spellcasting ruler in the demo.",
      "controlledBy": "gm",
      "socialTier": "henchman",
      "lifecycleState": "active",
      "creatureTypes": [
        "humanoid"
      ],
      "isEnchantedCreature": false,
      "hitDice": null,
      "heroicCode": null,
      "fatePoints": null,
      "transformationState": null,
      "currentJourneyId": null,
      "personalFatigue": 0,
      "hungerDays": 0,
      "dehydrationDays": 0
    },
    {
      "schemaVersion": 2,
      "id": "chr-05qogak",
      "name": "Master Edran Falor",
      "alignment": "L",
      "race": "human",
      "class": "Venturer",
      "level": 4,
      "xp": 0,
      "hp": {
        "current": 18,
        "max": 18
      },
      "ac": 4,
      "attackThrow": 9,
      "abilities": {
        "STR": 11,
        "INT": 14,
        "DEX": 13,
        "CON": 11,
        "CHA": 15,
        "WIL": 12
      },
      "savingThrows": {
        "paralysis": 15,
        "death": 15,
        "blast": 15,
        "implements": 15,
        "spells": 15
      },
      "proficiencies": [],
      "classPowers": [],
      "henchmanCap": 4,
      "inventory": [],
      "personalGp": 0,
      "constructionSupervisorCap": 0,
      "currentHexId": null,
      "currentDomainId": "dom-march-of-saltspur",
      "partyId": null,
      "travelDestination": null,
      "travelPace": "walking",
      "background": "Born to a merchant family in Cyfaraun, Edran sought his fortune at the frontier. Five years of building local contacts has paid off — he controls a passive investment in a Saltspur brewery and has one major caravan in transit.",
      "personality": "",
      "goals": [],
      "relationships": [],
      "secrets": "",
      "voice": "",
      "liegeCharacterId": null,
      "loyalty": 0,
      "monthlyWage": 0,
      "upkeepMonthly": 0,
      "honor": [],
      "shame": [],
      "mercantileNetwork": [],
      "earningsLedger": [],
      "history": [],
      "autoAdvance": true,
      "alive": true,
      "deceasedTurn": null,
      "notes": "Independent venturer based in Saltspur. Runs a small fleet of caravans along the coastal trade road. Pays the Marquis a modest tariff and occasionally fronts him intelligence.",
      "controlledBy": "gm",
      "socialTier": "independent",
      "lifecycleState": "active",
      "creatureTypes": [
        "humanoid"
      ],
      "isEnchantedCreature": false,
      "hitDice": null,
      "heroicCode": null,
      "fatePoints": null,
      "transformationState": null,
      "currentJourneyId": null,
      "personalFatigue": 0,
      "hungerDays": 0,
      "dehydrationDays": 0
    },
    {
      "schemaVersion": 2,
      "id": "chr-brother-cassian",
      "name": "Brother Cassian",
      "liegeCharacterId": "chr-marquis-aelric",
      "class": "Cleric",
      "level": 3,
      "xp": 6000,
      "alignment": "L",
      "abilities": {
        "STR": 10,
        "DEX": 10,
        "CON": 11,
        "INT": 12,
        "CHA": 11,
        "WIL": 14
      },
      "hp": {
        "current": 14,
        "max": 14,
        "hitDice": "3d6"
      },
      "monthlyWage": 50,
      "loyalty": 2,
      "morale": 0,
      "henchmanCap": 4,
      "proficiencies": [
        "Theology (2)",
        "Healing",
        "Diplomacy"
      ],
      "classPowers": [],
      "inventory": {
        "gear": [],
        "magicItems": []
      },
      "background": {
        "origin": "Auran provincial seminary",
        "notes": "Sent to serve the March of Saltspur after taking his vows; quiet, observant, devoted to bookkeeping the temple accounts."
      },
      "currentHexId": "hex-saltspur-keep",
      "history": [],
      "loyaltyHistory": [],
      "alive": true,
      "autoAdvance": true,
      "constructionSupervisorCap": 0,
      "mercantileNetwork": [],
      "controlledBy": "gm",
      "socialTier": "henchman",
      "lifecycleState": "active",
      "creatureTypes": [
        "humanoid"
      ],
      "isEnchantedCreature": false,
      "hitDice": null,
      "heroicCode": null,
      "fatePoints": null,
      "transformationState": null,
      "currentJourneyId": null,
      "personalFatigue": 0,
      "hungerDays": 0,
      "dehydrationDays": 0
    }
  ],
  "parties": [],
  "ventures": [
    {
      "schemaVersion": 2,
      "id": "vnt-ldakvpf",
      "venturerCharacterId": "chr-05qogak",
      "originDomainId": "dom-march-of-saltspur",
      "destinationDomainId": "dom-barony-northwatch",
      "cargo": [
        {
          "merchandiseId": "wine-spirits",
          "quantityStone": 30,
          "purchasePricePerStone": 18,
          "purchaseCostGp": 540
        },
        {
          "merchandiseId": "salt",
          "quantityStone": 60,
          "purchasePricePerStone": 4,
          "purchaseCostGp": 240
        },
        {
          "merchandiseId": "textiles",
          "quantityStone": 42,
          "purchasePricePerStone": 10,
          "purchaseCostGp": 420
        }
      ],
      "totalInvestment": 1200,
      "status": "in-transit",
      "departureTurn": 1,
      "expectedArrivalTurn": 7,
      "arrivalTurn": null,
      "completedTurn": null,
      "salePriceGp": null,
      "profitGp": null,
      "xpAwarded": 0,
      "vagaries": [],
      "notes": "Master Falor's Salt-and-Wine Run — coastal hop from Saltspur up to Northwatch Village. The textiles are on consignment from a Saltcombe weaver.",
      "syndicateDisruptionId": null,
      "politicalTariffs": [],
      "venturerName": "Master Edran Falor",
      "garrisonEscortUnits": []
    }
  ],
  "passiveInvestments": [
    {
      "schemaVersion": 2,
      "id": "inv-w3xz5n2",
      "name": "Saltspur Distillery",
      "ownerCharacterId": "chr-05qogak",
      "type": "Brewery",
      "riskTier": "balanced",
      "capital": 30000,
      "destinationDomainId": "dom-march-of-saltspur",
      "enabled": true,
      "createdTurn": 1,
      "vagaries": [],
      "notes": "Brewery producing spirits under royal license — half-share split with the saltworks guildhouse. Steady output, modest risk; books are audited by the Marquis's chaplain each quarter."
    }
  ],
  "deities": [],
  "banks": [],
  "loans": [],
  "pendingEvents": [
    {
      "schemaVersion": 2,
      "id": "evt-gxcgt7e",
      "kind": "rumor-emit",
      "submittedBy": "engine",
      "submittedAt": "2026-05-28T14:03:02.458Z",
      "gameTimeAt": null,
      "targetTurn": 5,
      "status": "pending",
      "payload": {
        "settlementId": "set-saltspur-town",
        "rumorText": "Caravan masters report a new bandit camp two days east — the Marquis's patrols haven't found it.",
        "topic": "monster",
        "apparentLevel": "common",
        "truthLevel": "true"
      },
      "gmNotes": "",
      "appliedAtTurn": null,
      "parentEventId": null,
      "supersededBy": null,
      "cadence": "monthly-turn",
      "subdayContext": null
    },
    {
      "schemaVersion": 2,
      "id": "evt-r5qeppj",
      "kind": "player-plan",
      "submittedBy": "player:edran",
      "submittedAt": "2026-05-28T14:03:02.458Z",
      "gameTimeAt": null,
      "targetTurn": 5,
      "status": "pending",
      "payload": {
        "characterId": "chr-05qogak",
        "summary": "Edran proposes to ride to Northwatch and offer Baron Yorick a 10% stake in a follow-on caravan in exchange for armed escort."
      },
      "gmNotes": "",
      "appliedAtTurn": null,
      "parentEventId": null,
      "supersededBy": null,
      "cadence": "monthly-turn",
      "subdayContext": null
    }
  ],
  "eventLog": [
    {
      "event": {
        "schemaVersion": 2,
        "id": "evt-demo-0001",
        "kind": "engine-standard-turn",
        "submittedBy": "engine",
        "submittedAt": "2026-05-28T14:03:02.458Z",
        "gameTimeAt": null,
        "targetTurn": 1,
        "status": "applied",
        "payload": {
          "domainId": "dom-barony-saltcombe",
          "summary": "Lady Mira completed Saltcombe's spring observances; tithes recorded without incident."
        },
        "gmNotes": "",
        "appliedAtTurn": 1,
        "parentEventId": null,
        "supersededBy": null
      },
      "result": {
        "domainsChanged": [
          "dom-barony-saltcombe"
        ],
        "narrativeSummary": "Lady Mira completed Saltcombe's spring observances; tithes recorded without incident."
      },
      "appliedAtTurn": 1,
      "appliedAt": "2026-01-28T14:03:02.458Z",
      "cadence": "monthly-turn",
      "subdayContext": null
    },
    {
      "event": {
        "schemaVersion": 2,
        "id": "evt-demo-0002",
        "kind": "engine-standard-turn",
        "submittedBy": "engine",
        "submittedAt": "2026-05-28T14:03:02.458Z",
        "gameTimeAt": null,
        "targetTurn": 1,
        "status": "applied",
        "payload": {
          "domainId": "dom-barony-northwatch",
          "summary": "Baron Yorick conducted the spring muster at Northwatch Tower; garrison rolls confirmed."
        },
        "gmNotes": "",
        "appliedAtTurn": 1,
        "parentEventId": null,
        "supersededBy": null
      },
      "result": {
        "domainsChanged": [
          "dom-barony-northwatch"
        ],
        "narrativeSummary": "Baron Yorick conducted the spring muster at Northwatch Tower; garrison rolls confirmed."
      },
      "appliedAtTurn": 1,
      "appliedAt": "2026-01-28T14:03:02.458Z",
      "cadence": "monthly-turn",
      "subdayContext": null
    },
    {
      "event": {
        "schemaVersion": 2,
        "id": "evt-demo-0003",
        "kind": "engine-standard-turn",
        "submittedBy": "engine",
        "submittedAt": "2026-05-28T14:03:02.458Z",
        "gameTimeAt": null,
        "targetTurn": 1,
        "status": "applied",
        "payload": {
          "domainId": "dom-march-of-saltspur",
          "summary": "Marquis Aelric Bran formally assumed authority over the March; tax assessment confirmed by the Royal Surveyor."
        },
        "gmNotes": "",
        "appliedAtTurn": 1,
        "parentEventId": null,
        "supersededBy": null
      },
      "result": {
        "domainsChanged": [
          "dom-march-of-saltspur"
        ],
        "narrativeSummary": "Marquis Aelric Bran formally assumed authority over the March; tax assessment confirmed by the Royal Surveyor."
      },
      "appliedAtTurn": 1,
      "appliedAt": "2026-01-28T14:03:02.458Z",
      "cadence": "monthly-turn",
      "subdayContext": null
    },
    {
      "event": {
        "schemaVersion": 2,
        "id": "evt-demo-0004",
        "kind": "engine-standard-turn",
        "submittedBy": "engine",
        "submittedAt": "2026-05-28T14:03:02.458Z",
        "gameTimeAt": null,
        "targetTurn": 2,
        "status": "applied",
        "payload": {
          "domainId": "dom-barony-saltcombe",
          "summary": "Saltcombe granaries received first deliveries from the upcountry; weavers' guild petitioned the baroness for a wool-tariff exemption."
        },
        "gmNotes": "",
        "appliedAtTurn": 2,
        "parentEventId": null,
        "supersededBy": null
      },
      "result": {
        "domainsChanged": [
          "dom-barony-saltcombe"
        ],
        "narrativeSummary": "Saltcombe granaries received first deliveries from the upcountry; weavers' guild petitioned the baroness for a wool-tariff exemption."
      },
      "appliedAtTurn": 2,
      "appliedAt": "2026-02-28T14:03:02.458Z",
      "cadence": "monthly-turn",
      "subdayContext": null
    },
    {
      "event": {
        "schemaVersion": 2,
        "id": "evt-demo-0005",
        "kind": "engine-standard-turn",
        "submittedBy": "engine",
        "submittedAt": "2026-05-28T14:03:02.458Z",
        "gameTimeAt": null,
        "targetTurn": 2,
        "status": "applied",
        "payload": {
          "domainId": "dom-barony-northwatch",
          "summary": "Northwatch outriders reported brigand spoor along the south road; Baron Yorick doubled the road watch."
        },
        "gmNotes": "",
        "appliedAtTurn": 2,
        "parentEventId": null,
        "supersededBy": null
      },
      "result": {
        "domainsChanged": [
          "dom-barony-northwatch"
        ],
        "narrativeSummary": "Northwatch outriders reported brigand spoor along the south road; Baron Yorick doubled the road watch."
      },
      "appliedAtTurn": 2,
      "appliedAt": "2026-02-28T14:03:02.458Z",
      "cadence": "monthly-turn",
      "subdayContext": null
    },
    {
      "event": {
        "schemaVersion": 2,
        "id": "evt-demo-0006",
        "kind": "engine-standard-turn",
        "submittedBy": "engine",
        "submittedAt": "2026-05-28T14:03:02.458Z",
        "gameTimeAt": null,
        "targetTurn": 2,
        "status": "applied",
        "payload": {
          "domainId": "dom-march-of-saltspur",
          "summary": "Master Edran Falor of the Venturers' Guild presented himself at Saltspur Keep seeking a charter for coastal arbitrage; granted under bond."
        },
        "gmNotes": "",
        "appliedAtTurn": 2,
        "parentEventId": null,
        "supersededBy": null
      },
      "result": {
        "domainsChanged": [
          "dom-march-of-saltspur"
        ],
        "narrativeSummary": "Master Edran Falor of the Venturers' Guild presented himself at Saltspur Keep seeking a charter for coastal arbitrage; granted under bond."
      },
      "appliedAtTurn": 2,
      "appliedAt": "2026-02-28T14:03:02.458Z",
      "cadence": "monthly-turn",
      "subdayContext": null
    },
    {
      "event": {
        "schemaVersion": 2,
        "id": "evt-demo-0007",
        "kind": "engine-standard-turn",
        "submittedBy": "engine",
        "submittedAt": "2026-05-28T14:03:02.458Z",
        "gameTimeAt": null,
        "targetTurn": 3,
        "status": "applied",
        "payload": {
          "domainId": "dom-barony-saltcombe",
          "summary": "Lady Mira's autumn services blessed the harvest; granary tithes recorded for the southern hexes."
        },
        "gmNotes": "",
        "appliedAtTurn": 3,
        "parentEventId": null,
        "supersededBy": null
      },
      "result": {
        "domainsChanged": [
          "dom-barony-saltcombe"
        ],
        "narrativeSummary": "Lady Mira's autumn services blessed the harvest; granary tithes recorded for the southern hexes."
      },
      "appliedAtTurn": 3,
      "appliedAt": "2026-03-28T14:03:02.458Z",
      "cadence": "monthly-turn",
      "subdayContext": null
    },
    {
      "event": {
        "schemaVersion": 2,
        "id": "evt-demo-0008",
        "kind": "engine-standard-turn",
        "submittedBy": "engine",
        "submittedAt": "2026-05-28T14:03:02.458Z",
        "gameTimeAt": null,
        "targetTurn": 3,
        "status": "applied",
        "payload": {
          "domainId": "dom-barony-northwatch",
          "summary": "Baron Yorick led a punitive sortie down the south road in coordination with Master Falor's outriders; smuggling pressure observably eased."
        },
        "gmNotes": "",
        "appliedAtTurn": 3,
        "parentEventId": null,
        "supersededBy": null
      },
      "result": {
        "domainsChanged": [
          "dom-barony-northwatch"
        ],
        "narrativeSummary": "Baron Yorick led a punitive sortie down the south road in coordination with Master Falor's outriders; smuggling pressure observably eased."
      },
      "appliedAtTurn": 3,
      "appliedAt": "2026-03-28T14:03:02.458Z",
      "cadence": "monthly-turn",
      "subdayContext": null
    },
    {
      "event": {
        "schemaVersion": 2,
        "id": "evt-demo-0009",
        "kind": "engine-standard-turn",
        "submittedBy": "engine",
        "submittedAt": "2026-05-28T14:03:02.458Z",
        "gameTimeAt": null,
        "targetTurn": 3,
        "status": "applied",
        "payload": {
          "domainId": "dom-march-of-saltspur",
          "summary": "Marquis Aelric Bran heard a wage dispute from the Saltspur saltworks guild; resolved with a 5% rise pending the autumn yield."
        },
        "gmNotes": "",
        "appliedAtTurn": 3,
        "parentEventId": null,
        "supersededBy": null
      },
      "result": {
        "domainsChanged": [
          "dom-march-of-saltspur"
        ],
        "narrativeSummary": "Marquis Aelric Bran heard a wage dispute from the Saltspur saltworks guild; resolved with a 5% rise pending the autumn yield."
      },
      "appliedAtTurn": 3,
      "appliedAt": "2026-03-28T14:03:02.458Z",
      "cadence": "monthly-turn",
      "subdayContext": null
    },
    {
      "event": {
        "schemaVersion": 2,
        "id": "evt-demo-000a",
        "kind": "adventure-result",
        "submittedBy": "gm",
        "submittedAt": "2026-05-28T14:03:02.458Z",
        "gameTimeAt": null,
        "targetTurn": 3,
        "status": "applied",
        "payload": {
          "characterId": "chr-05qogak",
          "summary": "Edran's outriders ambushed a smuggler band on the Northwatch road, recovered 240gp in smuggled silver and turned the prisoners over to the Marquis.",
          "treasuryDelta": 240,
          "targetDomainId": "dom-march-of-saltspur"
        },
        "gmNotes": "",
        "appliedAtTurn": 3,
        "parentEventId": null,
        "supersededBy": null
      },
      "result": {
        "domainsChanged": [
          "dom-march-of-saltspur"
        ],
        "treasuryDelta": 240,
        "narrativeSummary": "Edran's outriders ambushed a smuggler band on the Northwatch road, recovered 240gp in smuggled silver and turned the prisoners over to the Marquis."
      },
      "appliedAtTurn": 3,
      "appliedAt": "2026-03-28T14:03:02.458Z",
      "cadence": "monthly-turn",
      "subdayContext": null
    },
    {
      "event": {
        "schemaVersion": 2,
        "id": "evt-demo-000b",
        "kind": "engine-standard-turn",
        "submittedBy": "engine",
        "submittedAt": "2026-05-28T14:03:02.458Z",
        "gameTimeAt": null,
        "targetTurn": 4,
        "status": "applied",
        "payload": {
          "domainId": "dom-barony-saltcombe",
          "summary": "Saltcombe's seneschal handled routine matters while Lady Mira attended the Equinox Council at Saltspur."
        },
        "gmNotes": "",
        "appliedAtTurn": 4,
        "parentEventId": null,
        "supersededBy": null
      },
      "result": {
        "domainsChanged": [
          "dom-barony-saltcombe"
        ],
        "narrativeSummary": "Saltcombe's seneschal handled routine matters while Lady Mira attended the Equinox Council at Saltspur."
      },
      "appliedAtTurn": 4,
      "appliedAt": "2026-04-28T14:03:02.458Z",
      "cadence": "monthly-turn",
      "subdayContext": null
    },
    {
      "event": {
        "schemaVersion": 2,
        "id": "evt-demo-000c",
        "kind": "engine-standard-turn",
        "submittedBy": "engine",
        "submittedAt": "2026-05-28T14:03:02.458Z",
        "gameTimeAt": null,
        "targetTurn": 4,
        "status": "applied",
        "payload": {
          "domainId": "dom-barony-northwatch",
          "summary": "Baron Yorick reinforced the south road with two squads of light foot; the harvest convoy passed unmolested."
        },
        "gmNotes": "",
        "appliedAtTurn": 4,
        "parentEventId": null,
        "supersededBy": null
      },
      "result": {
        "domainsChanged": [
          "dom-barony-northwatch"
        ],
        "narrativeSummary": "Baron Yorick reinforced the south road with two squads of light foot; the harvest convoy passed unmolested."
      },
      "appliedAtTurn": 4,
      "appliedAt": "2026-04-28T14:03:02.458Z",
      "cadence": "monthly-turn",
      "subdayContext": null
    },
    {
      "event": {
        "schemaVersion": 2,
        "id": "evt-demo-000d",
        "kind": "engine-standard-turn",
        "submittedBy": "engine",
        "submittedAt": "2026-05-28T14:03:02.458Z",
        "gameTimeAt": null,
        "targetTurn": 4,
        "status": "applied",
        "payload": {
          "domainId": "dom-march-of-saltspur",
          "summary": "Marquis Aelric Bran convened the Equinox Council at Saltspur; all vassals attended in good standing. Master Falor's salt-and-wine cargo departed for Northwatch under bonded escort."
        },
        "gmNotes": "",
        "appliedAtTurn": 4,
        "parentEventId": null,
        "supersededBy": null
      },
      "result": {
        "domainsChanged": [
          "dom-march-of-saltspur"
        ],
        "narrativeSummary": "Marquis Aelric Bran convened the Equinox Council at Saltspur; all vassals attended in good standing. Master Falor's salt-and-wine cargo departed for Northwatch under bonded escort."
      },
      "appliedAtTurn": 4,
      "appliedAt": "2026-04-28T14:03:02.458Z",
      "cadence": "monthly-turn",
      "subdayContext": null
    }
  ],
  "hexes": [
    {
      "schemaVersion": 2,
      "id": "hex-saltspur-keep",
      "coord": {
        "q": 0,
        "r": 0
      },
      "classification": "Borderlands",
      "explored": true,
      "families": 180,
      "valuePerFamily": 7,
      "landImprovementBonus": 1,
      "landImprovementProjects": [],
      "terrain": "plains",
      "primaryStructure": "Saltspur Keep (Marquis's seat)",
      "settlement": {
        "schemaVersion": 2,
        "id": "set-saltspur-town",
        "name": "Saltspur",
        "families": 220,
        "totalInvestment": 30000,
        "foundedTurn": 1,
        "foundedByCharacterId": null,
        "demandModifiers": {
          "salt": -2,
          "grain-vegetables": -1,
          "spices": 1
        },
        "rumors": [],
        "entryways": null,
        "regulatedAssets": null,
        "notes": "Class V market town clustered around the keep. Famous for the salt pans on the coast."
      },
      "lairs": [],
      "dungeons": [],
      "pointsOfInterest": [],
      "monsterNotes": "",
      "notes": "Seat of the March. Town and keep share the hex.",
      "domainId": "dom-march-of-saltspur",
      "economyType": "agricultural",
      "terrainTransformationState": null,
      "hasRoad": false,
      "hasTrail": false,
      "elevationFt": 0
    },
    {
      "schemaVersion": 2,
      "id": "hex-saltspur-fields",
      "coord": {
        "q": 1,
        "r": 0
      },
      "classification": "Borderlands",
      "explored": true,
      "families": 140,
      "valuePerFamily": 7,
      "landImprovementBonus": 0,
      "landImprovementProjects": [
        {
          "id": "lip-2t8kgh9",
          "schemaVersion": 2,
          "targetBonus": 1,
          "monthlyContribution": 800,
          "accumulated": 1600,
          "startedTurn": 3,
          "supervisors": [
            {
              "characterId": "chr-05qogak",
              "monthsLeft": 4
            }
          ],
          "notes": "Drainage works in the western fields — financed in part by the Saltspur Distillery to expand barley supply."
        }
      ],
      "terrain": "plains",
      "primaryStructure": "",
      "settlement": null,
      "lairs": [],
      "dungeons": [],
      "pointsOfInterest": [],
      "monsterNotes": "",
      "notes": "Grain country. The march's breadbasket.",
      "domainId": "dom-march-of-saltspur",
      "landImprovementInvested": 12500,
      "economyType": "agricultural",
      "terrainTransformationState": null,
      "hasRoad": false,
      "hasTrail": false,
      "elevationFt": 0
    },
    {
      "schemaVersion": 2,
      "id": "hex-saltpans",
      "coord": {
        "q": 0,
        "r": 1
      },
      "classification": "Borderlands",
      "explored": true,
      "families": 90,
      "valuePerFamily": 8,
      "landImprovementBonus": 0,
      "landImprovementProjects": [],
      "terrain": "coast",
      "primaryStructure": "Salt-pan complex",
      "settlement": null,
      "lairs": [],
      "dungeons": [],
      "pointsOfInterest": [
        {
          "schemaVersion": 2,
          "id": "poi-salt-pans",
          "name": "Saltspur Pans",
          "kind": "industry",
          "description": "The pans that gave the march its name. Tariff revenue is significant."
        }
      ],
      "monsterNotes": "",
      "notes": "Source of the march's salt wealth and identity.",
      "domainId": "dom-march-of-saltspur",
      "economyType": "agricultural",
      "terrainTransformationState": null,
      "hasRoad": false,
      "hasTrail": false,
      "elevationFt": 0
    },
    {
      "schemaVersion": 2,
      "id": "hex-coastal-march",
      "coord": {
        "q": -1,
        "r": 1
      },
      "classification": "Borderlands",
      "explored": true,
      "families": 70,
      "valuePerFamily": 6,
      "landImprovementBonus": 0,
      "landImprovementProjects": [],
      "terrain": "coast",
      "primaryStructure": "",
      "settlement": null,
      "lairs": [],
      "dungeons": [],
      "pointsOfInterest": [],
      "monsterNotes": "",
      "notes": "Fishing villages along the coast.",
      "domainId": "dom-march-of-saltspur",
      "economyType": "agricultural",
      "terrainTransformationState": null,
      "hasRoad": false,
      "hasTrail": false,
      "elevationFt": 0
    },
    {
      "schemaVersion": 2,
      "id": "hex-northwatch-tower",
      "coord": {
        "q": 0,
        "r": -2
      },
      "classification": "Borderlands",
      "explored": true,
      "families": 80,
      "valuePerFamily": 6,
      "landImprovementBonus": 0,
      "landImprovementProjects": [],
      "terrain": "hills",
      "primaryStructure": "Tower of Northwatch",
      "settlement": {
        "schemaVersion": 2,
        "id": "set-northwatch-village",
        "name": "Northwatch Village",
        "families": 60,
        "totalInvestment": 5000,
        "foundedTurn": 1,
        "foundedByCharacterId": null,
        "demandModifiers": {},
        "rumors": [],
        "entryways": null,
        "regulatedAssets": null,
        "notes": "A market hamlet under the tower's walls."
      },
      "lairs": [],
      "dungeons": [],
      "pointsOfInterest": [],
      "monsterNotes": "",
      "notes": "Yorick's seat. Forward-watchtower against the wastes.",
      "domainId": "dom-barony-northwatch",
      "economyType": "agricultural",
      "terrainTransformationState": null,
      "hasRoad": false,
      "hasTrail": false,
      "elevationFt": 0
    },
    {
      "schemaVersion": 2,
      "id": "hex-northwatch-farms",
      "coord": {
        "q": 1,
        "r": -2
      },
      "classification": "Borderlands",
      "explored": true,
      "families": 55,
      "valuePerFamily": 6,
      "landImprovementBonus": 0,
      "landImprovementProjects": [],
      "terrain": "plains",
      "primaryStructure": "",
      "settlement": null,
      "lairs": [],
      "dungeons": [],
      "pointsOfInterest": [],
      "monsterNotes": "",
      "notes": "Mixed farmland.",
      "domainId": "dom-barony-northwatch",
      "economyType": "agricultural",
      "terrainTransformationState": null,
      "hasRoad": false,
      "hasTrail": false,
      "elevationFt": 0
    },
    {
      "schemaVersion": 2,
      "id": "hex-saltcombe-shrine",
      "coord": {
        "q": -2,
        "r": 1
      },
      "classification": "Civilized",
      "explored": true,
      "families": 100,
      "valuePerFamily": 6,
      "landImprovementBonus": 0,
      "landImprovementProjects": [],
      "terrain": "coast",
      "primaryStructure": "Shrine-Chapter of the Salt Saint",
      "settlement": {
        "schemaVersion": 2,
        "id": "set-saltcombe-town",
        "name": "Saltcombe Town",
        "families": 90,
        "totalInvestment": 8000,
        "foundedTurn": 1,
        "foundedByCharacterId": null,
        "demandModifiers": {
          "salt": -1
        },
        "rumors": [],
        "entryways": null,
        "regulatedAssets": null,
        "notes": "A small priestly town built around the shrine."
      },
      "lairs": [],
      "dungeons": [],
      "pointsOfInterest": [
        {
          "schemaVersion": 2,
          "id": "poi-salt-saint",
          "name": "Shrine of the Salt Saint",
          "kind": "temple",
          "description": "A regional pilgrimage destination. Pilgrims pay a small toll which is logged as tithe income."
        }
      ],
      "monsterNotes": "",
      "notes": "Mira's seat. The shrine is the barony's identity.",
      "domainId": "dom-barony-saltcombe",
      "economyType": "agricultural",
      "terrainTransformationState": null,
      "hasRoad": false,
      "hasTrail": false,
      "elevationFt": 0
    },
    {
      "schemaVersion": 2,
      "id": "hex-saltcombe-fields",
      "coord": {
        "q": 0,
        "r": 2
      },
      "classification": "Civilized",
      "explored": true,
      "families": 65,
      "valuePerFamily": 6,
      "landImprovementBonus": 0,
      "landImprovementProjects": [],
      "terrain": "plains",
      "primaryStructure": "",
      "settlement": null,
      "lairs": [],
      "dungeons": [],
      "pointsOfInterest": [],
      "monsterNotes": "",
      "notes": "Pilgrim-road farms.",
      "domainId": "dom-barony-saltcombe",
      "economyType": "agricultural",
      "terrainTransformationState": null,
      "hasRoad": false,
      "hasTrail": false,
      "elevationFt": 0
    }
  ],
  "settlements": [
    {
      "schemaVersion": 2,
      "id": "set-saltspur-town",
      "name": "Saltspur",
      "families": 220,
      "totalInvestment": 30000,
      "foundedTurn": 1,
      "foundedByCharacterId": null,
      "demandModifiers": {
        "salt": -2,
        "grain-vegetables": -1,
        "spices": 1
      },
      "rumors": [],
      "entryways": [
        {
          "schemaVersion": 2,
          "id": "ent-rgpcevj",
          "kind": "road",
          "label": "",
          "direction": "",
          "securityLevel": "watched",
          "inspectionChance": 40,
          "notes": "The coastal road comes in from the east, guarded by a small toll-house. Standard caravan inspection on arrival."
        }
      ],
      "regulatedAssets": [
        {
          "schemaVersion": 2,
          "id": "reg-unzjcjn",
          "merchandiseCategoryId": "spirits",
          "restriction": "licensed",
          "license": "Saltspur Distillation Charter",
          "notes": "Distillation requires a license from the Marquis. Master Falor holds one for his Saltspur brewery."
        }
      ],
      "notes": "Class V market town clustered around the keep. Famous for the salt pans on the coast.",
      "hexId": "hex-saltspur-keep",
      "marketClass": "VI",
      "notability": {
        "weapons": -1,
        "armor": 0,
        "magic": 0,
        "luxury": 0,
        "exotic": 0,
        "livestock": 0,
        "art": 0,
        "food": 0,
        "mercantile": 2
      },
      "notabilityNotes": "Salt trade gives Saltspur modest mercantile reach into the Borderlands. Few smiths means arms are imported.",
      "placesOfPower": []
    },
    {
      "schemaVersion": 2,
      "id": "set-northwatch-village",
      "name": "Northwatch Village",
      "families": 60,
      "totalInvestment": 5000,
      "foundedTurn": 1,
      "foundedByCharacterId": null,
      "demandModifiers": {},
      "rumors": [],
      "entryways": [],
      "regulatedAssets": [],
      "notes": "A market hamlet under the tower's walls.",
      "hexId": "hex-northwatch-tower",
      "placesOfPower": []
    },
    {
      "schemaVersion": 2,
      "id": "set-saltcombe-town",
      "name": "Saltcombe Town",
      "families": 90,
      "totalInvestment": 8000,
      "foundedTurn": 1,
      "foundedByCharacterId": null,
      "demandModifiers": {
        "salt": -1
      },
      "rumors": [],
      "entryways": [],
      "regulatedAssets": [],
      "notes": "A small priestly town built around the shrine.",
      "hexId": "hex-saltcombe-shrine",
      "placesOfPower": []
    }
  ],
  "rumors": [
    {
      "schemaVersion": 2,
      "id": "rum-rvfwxmv",
      "text": "Whispers in Saltspur claim Aelric Bran refuses to send any more sons to the king's wars.",
      "truthLevel": "partial",
      "apparentLevel": "uncommon",
      "topic": "treason",
      "origin": {
        "submittedAt": "2026-05-28T14:03:02.457Z",
        "submittedBy": "gm",
        "sourceEventId": null,
        "sourceCharacterId": null
      },
      "proliferation": {
        "enabled": false,
        "chancePerMonth": 10,
        "settlementsReached": []
      },
      "history": [],
      "notes": "",
      "reach": [
        {
          "settlementId": "set-saltspur-town",
          "apparentLevel": "uncommon",
          "firstHeardTurn": 3,
          "source": "manual"
        }
      ]
    },
    {
      "schemaVersion": 2,
      "id": "rum-9eoxcm0",
      "text": "A trader claims to have seen the hull of an old Auran warship at the bottom of Saltcombe Bay at low tide.",
      "truthLevel": "true",
      "apparentLevel": "rare",
      "topic": "treasure",
      "origin": {
        "submittedAt": "2026-05-28T14:03:02.457Z",
        "submittedBy": "gm",
        "sourceEventId": null,
        "sourceCharacterId": null
      },
      "proliferation": {
        "enabled": false,
        "chancePerMonth": 5,
        "settlementsReached": []
      },
      "history": [],
      "notes": "",
      "reach": [
        {
          "settlementId": "set-saltspur-town",
          "apparentLevel": "rare",
          "firstHeardTurn": 2,
          "source": "manual"
        },
        {
          "settlementId": "set-saltcombe-town",
          "apparentLevel": "common",
          "firstHeardTurn": 1,
          "source": "manual"
        }
      ]
    },
    {
      "schemaVersion": 2,
      "id": "rum-w21lkvt",
      "text": "Wolves bigger than horses are taking calves from the herd along the northern trade road.",
      "truthLevel": "true",
      "apparentLevel": "common",
      "topic": "monster",
      "origin": {
        "submittedAt": "2026-05-28T14:03:02.457Z",
        "submittedBy": "gm",
        "sourceEventId": null,
        "sourceCharacterId": null
      },
      "proliferation": {
        "enabled": false,
        "chancePerMonth": 25,
        "settlementsReached": []
      },
      "history": [],
      "notes": "",
      "reach": [
        {
          "settlementId": "set-saltspur-town",
          "apparentLevel": "common",
          "firstHeardTurn": 4,
          "source": "manual"
        },
        {
          "settlementId": "set-northwatch-village",
          "apparentLevel": "common",
          "firstHeardTurn": 3,
          "source": "manual"
        }
      ]
    },
    {
      "schemaVersion": 2,
      "id": "rum-f60a9uq",
      "text": "Lady Mira of Saltcombe quietly stopped tithing to the diocese three months ago.",
      "truthLevel": "true",
      "apparentLevel": "uncommon",
      "topic": "scandal",
      "origin": {
        "submittedAt": "2026-05-28T14:03:02.457Z",
        "submittedBy": "gm",
        "sourceEventId": null,
        "sourceCharacterId": null
      },
      "proliferation": {
        "enabled": false,
        "chancePerMonth": 10,
        "settlementsReached": []
      },
      "history": [],
      "notes": "",
      "reach": [
        {
          "settlementId": "set-saltcombe-town",
          "apparentLevel": "uncommon",
          "firstHeardTurn": 2,
          "source": "manual"
        }
      ]
    },
    {
      "schemaVersion": 2,
      "id": "rum-2xh9pe3",
      "text": "A royal courier is en route to the March, escorted by a half-dozen riders.",
      "truthLevel": "true",
      "apparentLevel": "rare",
      "topic": "dignitary",
      "origin": {
        "submittedAt": "2026-05-28T14:03:02.457Z",
        "submittedBy": "gm",
        "sourceEventId": null,
        "sourceCharacterId": null
      },
      "proliferation": {
        "enabled": false,
        "chancePerMonth": 5,
        "settlementsReached": []
      },
      "history": [],
      "notes": "",
      "reach": [
        {
          "settlementId": null,
          "apparentLevel": "rare",
          "firstHeardTurn": 4,
          "source": "manual"
        }
      ]
    }
  ],
  "description": "\n\nDemo campaign for ACKS God Mode — a 5-month-old March of Saltspur with two vassal baronies, a registered venturer mid-caravan, brewing rumors, and one agricultural project in progress. Fork via Save As to make it your own.",
  "henchmanships": [
    {
      "schemaVersion": 2,
      "id": "hen-e4hhmly",
      "subjectCharacterId": "chr-sir-tomas-castellan",
      "patronCharacterId": "chr-marquis-aelric",
      "hiredAtTurn": 5,
      "signingBonusPaidGp": 0,
      "wageStreamGpMo": 100,
      "currentLoyalty": 2,
      "loyaltyHistory": [],
      "history": [
        {
          "turn": 5,
          "type": "created",
          "reason": "migrated-from-legacy-scalar"
        }
      ],
      "status": "active"
    },
    {
      "schemaVersion": 2,
      "id": "hen-1jzm814",
      "subjectCharacterId": "chr-baron-yorick",
      "patronCharacterId": "chr-marquis-aelric",
      "hiredAtTurn": 5,
      "signingBonusPaidGp": 0,
      "wageStreamGpMo": 240,
      "currentLoyalty": 0,
      "loyaltyHistory": [],
      "history": [
        {
          "turn": 5,
          "type": "created",
          "reason": "migrated-from-legacy-scalar"
        }
      ],
      "status": "active"
    },
    {
      "schemaVersion": 2,
      "id": "hen-miwc2p2",
      "subjectCharacterId": "chr-baroness-mira",
      "patronCharacterId": "chr-marquis-aelric",
      "hiredAtTurn": 5,
      "signingBonusPaidGp": 0,
      "wageStreamGpMo": 200,
      "currentLoyalty": 0,
      "loyaltyHistory": [],
      "history": [
        {
          "turn": 5,
          "type": "created",
          "reason": "migrated-from-legacy-scalar"
        }
      ],
      "status": "active"
    },
    {
      "schemaVersion": 2,
      "id": "hen-m7w5v9h",
      "subjectCharacterId": "chr-brother-cassian",
      "patronCharacterId": "chr-marquis-aelric",
      "hiredAtTurn": 5,
      "signingBonusPaidGp": 0,
      "wageStreamGpMo": 50,
      "currentLoyalty": 2,
      "loyaltyHistory": [],
      "history": [
        {
          "turn": 5,
          "type": "created",
          "reason": "migrated-from-legacy-scalar"
        }
      ],
      "status": "active"
    }
  ],
  "magistracies": [
    {
      "schemaVersion": 2,
      "id": "mag-ydkz61i",
      "magistrateCharacterId": "chr-sir-tomas-castellan",
      "domainId": "dom-march-of-saltspur",
      "role": "captain-of-the-guard",
      "appointedAtTurn": 5,
      "salaryCategory": "garrison",
      "performanceLog": [],
      "history": [
        {
          "turn": 5,
          "type": "created",
          "reason": "migrated-from-legacy-scalar"
        }
      ],
      "status": "active"
    },
    {
      "schemaVersion": 2,
      "id": "mag-0yo1cy5",
      "magistrateCharacterId": "chr-brother-cassian",
      "domainId": "dom-march-of-saltspur",
      "role": "chaplain",
      "appointedAtTurn": 5,
      "salaryCategory": "tithe",
      "performanceLog": [],
      "history": [
        {
          "turn": 5,
          "type": "created",
          "reason": "migrated-from-legacy-scalar"
        }
      ],
      "status": "active"
    }
  ],
  "vassalages": [
    {
      "schemaVersion": 2,
      "id": "vas-5pczjvl",
      "vassalRulerCharacterId": "chr-baron-yorick",
      "suzerainCharacterId": "chr-marquis-aelric",
      "vassalDomainId": "dom-barony-northwatch",
      "suzerainDomainId": "dom-march-of-saltspur",
      "oathTakenAtTurn": 5,
      "witnessCharacterIds": [],
      "recognitionStatus": "recognized",
      "history": [
        {
          "turn": 5,
          "type": "created",
          "reason": "migrated-from-legacy-scalar"
        }
      ],
      "status": "active"
    },
    {
      "schemaVersion": 2,
      "id": "vas-5u5ylzz",
      "vassalRulerCharacterId": "chr-baroness-mira",
      "suzerainCharacterId": "chr-marquis-aelric",
      "vassalDomainId": "dom-barony-saltcombe",
      "suzerainDomainId": "dom-march-of-saltspur",
      "oathTakenAtTurn": 5,
      "witnessCharacterIds": [],
      "recognitionStatus": "recognized",
      "history": [
        {
          "turn": 5,
          "type": "created",
          "reason": "migrated-from-legacy-scalar"
        }
      ],
      "status": "active"
    }
  ],
  "currentDayInMonth": 1,
  "dungeons": [],
  "journeys": [],
  "outposts": [],
  "congregations": [],
  "divineFavors": [],
  "attunements": [],
  "settlementVisits": [],
  "oaths": [],
  "vagaryOfIncursionEvents": [],
  "projects": [
    {
      "schemaVersion": 2,
      "id": "prj-azzevak",
      "constructibleKind": "agricultural-improvement",
      "constructibleSubtype": null,
      "name": "Agricultural improvement — (1,0)",
      "siteHexId": "hex-saltspur-fields",
      "siteSettlementId": null,
      "siteConstructibleId": null,
      "ownerCharacterId": null,
      "ownerDomainId": "dom-march-of-saltspur",
      "isRepair": false,
      "repairTargetConstructibleId": null,
      "totalCost": 50000,
      "gpSpent": 12500,
      "laborInvested": 0,
      "laborRequired": 0,
      "workerCounts": {},
      "workerCapPerDay": 0,
      "supervisorCharacterIds": [],
      "requiredSupervisorRating": 0,
      "magicAssist": {
        "ditches": false,
        "mire": false,
        "walls": false,
        "multipliers": {}
      },
      "lifecycleState": "under-construction",
      "startedAtTurn": null,
      "completedAtTurn": null,
      "estimatedCompletionTurn": null,
      "daysElapsed": 0,
      "history": [
        {
          "turn": null,
          "type": "migrated",
          "narrative": "Agricultural improvement lifted onto the unified Project model (bonus +0, 12 500gp toward the next step)."
        }
      ],
      "notes": ""
    }
  ],
  "constructibles": []
};
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
