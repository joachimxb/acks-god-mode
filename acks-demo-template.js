// Auto-generated from Templates/v2-established-march.acks.json, then run through
// ACKS.migrateCampaign so the shipped demo matches exactly what the loader produces.
// Regenerated 2026-06-05 — Saltspur expansion (rev 2): a contiguous 9×5 hex field with a
// Salt Sea row + a 1-hex wilderness buffer ring; the Free Holding of Tidewrack (a far
// Outlands port with its own settlement) reached by a single straight coastal road over
// the Saltspur Pass; 3 characters; 3 lair Groups (Monster Persistence #476); 4 rumors.
// migrateCampaign is a no-op on this file, asserted by tests/smoke.js. Exposes window.ACKS_DEMO_TEMPLATE.
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
              "q": 7,
              "r": 3
            },
            "classification": "Borderlands",
            "explored": true,
            "families": 180,
            "valuePerFamily": 7,
            "landImprovementBonus": 1,
            "landImprovementProjects": [],
            "terrain": "coast",
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
            "name": "Saltspur"
          },
          {
            "schemaVersion": 2,
            "id": "hex-saltspur-fields",
            "coord": {
              "q": 7,
              "r": 2
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
            "notes": "Grain country. The march's breadbasket.",
            "name": "Saltspur Fields"
          },
          {
            "schemaVersion": 2,
            "id": "hex-saltpans",
            "coord": {
              "q": 6,
              "r": 3
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
            "notes": "Source of the march's salt wealth and identity.",
            "name": "The Saltpans"
          },
          {
            "schemaVersion": 2,
            "id": "hex-coastal-march",
            "coord": {
              "q": 6,
              "r": 2
            },
            "classification": "Borderlands",
            "explored": true,
            "families": 112,
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
            "notes": "Fishing villages along the coast.",
            "name": "Saltspur Vale"
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
      "notes": "The march itself. Aelric directly administers the central hexes; his two vassal barons hold the rest. West of Saltcombe the coast turns wild and rises into the Saltspur range; the old Auran pass-road climbs over it to the free port of Tidewrack, the March’s one thread to the western sea. Aelric keeps no garrison past the pass-stone — the king’s wars have taken too many sons — so the wild stretch, and its lairs, are no one’s to hold.",
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
      },
      "treasuryStashId": "stash-zb8omrq"
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
              "q": 6,
              "r": 1
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
            "name": "Northwatch Tower"
          },
          {
            "schemaVersion": 2,
            "id": "hex-northwatch-farms",
            "coord": {
              "q": 5,
              "r": 1
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
            "notes": "Mixed farmland.",
            "name": "Northwatch Farms"
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
      "notes": "Yorick's barony. Owes ~10% tribute to the March monthly.",
      "treasuryStashId": "stash-4g63vys"
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
              "q": 5,
              "r": 3
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
            "name": "Saltcombe"
          },
          {
            "schemaVersion": 2,
            "id": "hex-saltcombe-fields",
            "coord": {
              "q": 5,
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
            "notes": "Pilgrim-road farms.",
            "name": "Saltcombe Fields"
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
      "notes": "Mira's barony. Smallest of the three, but the pilgrim trade keeps it solvent.",
      "treasuryStashId": "stash-995bwaj"
    },
    {
      "schemaVersion": 2,
      "kind": "domain",
      "id": "dom-tidewrack",
      "name": "Free Holding of Tidewrack",
      "createdAt": "2026-06-05",
      "lastModifiedAt": "2026-06-05",
      "type": "rural",
      "classification": "Outlands",
      "tags": [],
      "rulerCharacterId": "chr-tidewrack-warden",
      "administersThisMonth": false,
      "liegeId": null,
      "vassalIds": [],
      "isRealm": false,
      "geography": {
        "hexMapId": null,
        "primaryHex": {
          "q": 1,
          "r": 3
        },
        "hexScale": "6-mile",
        "controlledHexes": 2,
        "claimedHexes": 2,
        "controlledHexList": [
          "hex-tidewrack-strand",
          "hex-tidewrack-cove"
        ],
        "hexes": [
          {
            "schemaVersion": 2,
            "id": "hex-tidewrack-strand",
            "coord": {
              "q": 1,
              "r": 2
            },
            "classification": "Borderlands",
            "explored": true,
            "families": 120,
            "valuePerFamily": 6,
            "landImprovementBonus": 0,
            "landImprovementInvested": 0,
            "landImprovementProjects": [],
            "queuedImprovementGp": 0,
            "improvementBudgetGp": 0,
            "constructionSupervisorCharacterIds": [],
            "terrain": "coast",
            "hasRoad": false,
            "hasTrail": false,
            "roadSides": [],
            "riverSides": [],
            "crossingSides": [],
            "elevationFt": 0,
            "groundCondition": "clear",
            "hasLake": false,
            "freshWater": false,
            "primaryStructure": "",
            "settlement": null,
            "lairs": [],
            "dungeons": [],
            "pointsOfInterest": [],
            "monsterNotes": "",
            "notes": "The amber-strand and salt-fish flats that feed Tidewrack — grey amber comes up here after westerly storms.",
            "economyType": "agricultural",
            "terrainTransformationState": null,
            "name": "Tidewrack Strand",
            "domainId": "dom-tidewrack"
          },
          {
            "schemaVersion": 2,
            "id": "hex-tidewrack-cove",
            "coord": {
              "q": 1,
              "r": 3
            },
            "classification": "Borderlands",
            "explored": true,
            "families": 0,
            "valuePerFamily": 6,
            "landImprovementBonus": 0,
            "landImprovementInvested": 0,
            "landImprovementProjects": [],
            "queuedImprovementGp": 0,
            "improvementBudgetGp": 0,
            "constructionSupervisorCharacterIds": [],
            "terrain": "coast",
            "hasRoad": true,
            "hasTrail": false,
            "roadSides": [
              0
            ],
            "riverSides": [],
            "crossingSides": [],
            "elevationFt": 0,
            "groundCondition": "clear",
            "hasLake": false,
            "freshWater": false,
            "primaryStructure": "",
            "settlement": {
              "schemaVersion": 2,
              "id": "set-tidewrack",
              "name": "Tidewrack",
              "families": 85,
              "totalInvestment": 10000,
              "foundedTurn": 1,
              "foundedByCharacterId": null,
              "demandModifiers": {},
              "placesOfPower": [],
              "rumors": [],
              "entryways": [],
              "regulatedAssets": [],
              "notes": "A salvage-port of salt-fishers, amber-gatherers, and wreck-divers on the bones of an Auran naval station. The inner harbour drowns an old warship; the Saltwidow’s shrine stands on the one Auran mole still above the tide.",
              "hexId": "hex-tidewrack-cove",
              "marketClass": "VI"
            },
            "lairs": [],
            "dungeons": [],
            "pointsOfInterest": [],
            "monsterNotes": "",
            "notes": "A deep, sheltered cove over a half-drowned Auran naval station; at low water the masts of an old warship break the inner harbour. The free town of Tidewrack clings to the salvage-quays.",
            "economyType": "agricultural",
            "terrainTransformationState": null,
            "name": "Tidewrack Cove",
            "domainId": "dom-tidewrack"
          }
        ],
        "terrain": "",
        "features": []
      },
      "demographics": {
        "peasantFamilies": 120,
        "urbanFamilies": 85,
        "morale": -1,
        "moraleNotes": "Proud and fiercely independent, but pressed: the pass-caravans come back short, the Deepwood and Saltmarsh things grow bold, and no help comes over the range."
      },
      "treasury": {
        "gp": 2400
      },
      "income": {
        "landRevenuePerFamily": 6,
        "serviceRevenuePerFamily": 4,
        "miscPerFamily": 0,
        "miscFlat": 0,
        "taxPerFamily": 2,
        "tributesIn": [],
        "tariffs": 0,
        "urbanRevenue": 0,
        "other": []
      },
      "expenses": {
        "garrisonMonthly": 0,
        "liturgyPerFamily": 1,
        "miscPerFamily": 0,
        "miscFlat": 0,
        "tithesOut": [],
        "titheMonthly": 0,
        "tithePaid": true,
        "strongholdMaintenance": 0,
        "personalExpenses": 0,
        "tributeToLiege": 0,
        "tributeAuto": false,
        "tributePaid": true,
        "other": []
      },
      "taxPolicy": {
        "rate": "standard",
        "moraleImpact": 0
      },
      "garrison": {
        "units": [],
        "totalMonthlyCost": 0,
        "totalBR": 0
      },
      "stronghold": {
        "components": [],
        "maintenancePerMonth": 0,
        "garrisonCapacity": 0
      },
      "monthlyLaborCapGp": 0,
      "specialists": [],
      "henchmenCharacterIds": [],
      "magistrates": {
        "captainOfGuard": {
          "characterId": null,
          "administersThisMonth": false
        },
        "chaplain": {
          "characterId": null,
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
      },
      "urban": {
        "marketClass": "VI",
        "totalInvestment": 12000,
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
      "notes": "An ancient, half-drowned Auran naval port at the far end of the salt coast, reached overland only by the Saltspur Pass — or by sea. Tidewrack never swore to the March; it kept its own customs after the Auran collapse and lives now on salt-fish, grey amber, and salvage from the Wrack. Ruled by the Tide-Warden, Sevrina Vael, who burns the Marquis’s letters unread.",
      "treasuryStashId": "stash-hvp1bkl"
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
      "dehydrationDays": 0,
      "coins": {
        "pp": 0,
        "gp": 0,
        "ep": 0,
        "sp": 0,
        "cp": 0
      }
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
      "dehydrationDays": 0,
      "coins": {
        "pp": 0,
        "gp": 0,
        "ep": 0,
        "sp": 0,
        "cp": 0
      }
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
      "dehydrationDays": 0,
      "coins": {
        "pp": 0,
        "gp": 0,
        "ep": 0,
        "sp": 0,
        "cp": 0
      }
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
      "dehydrationDays": 0,
      "coins": {
        "pp": 0,
        "gp": 0,
        "ep": 0,
        "sp": 0,
        "cp": 0
      }
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
      "dehydrationDays": 0,
      "coins": {
        "pp": 0,
        "gp": 0,
        "ep": 0,
        "sp": 0,
        "cp": 0
      }
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
      "dehydrationDays": 0,
      "coins": {
        "pp": 0,
        "gp": 0,
        "ep": 0,
        "sp": 0,
        "cp": 0
      },
      "personalGp": 0
    },
    {
      "schemaVersion": 2,
      "id": "chr-tidewrack-warden",
      "name": "Sevrina Vael, Tide-Warden of Tidewrack",
      "alignment": "N",
      "race": "human",
      "class": "Explorer",
      "level": 7,
      "xp": 100000,
      "hp": {
        "current": 31,
        "max": 31,
        "hitDice": "7d6"
      },
      "ac": 5,
      "attackThrow": 6,
      "abilities": {
        "STR": 13,
        "INT": 12,
        "DEX": 16,
        "CON": 14,
        "CHA": 13,
        "WIL": 11
      },
      "savingThrows": {
        "paralysis": 8,
        "death": 9,
        "blast": 10,
        "implements": 11,
        "spells": 12
      },
      "proficiencies": [
        "Navigation",
        "Survival",
        "Seafaring",
        "Alertness",
        "Tracking"
      ],
      "classPowers": [
        "Animal Reflexes"
      ],
      "henchmanCap": 4,
      "inventory": [],
      "personalGp": 1200,
      "currentHexId": "hex-tidewrack-cove",
      "currentDomainId": "dom-tidewrack",
      "partyId": null,
      "travelDestination": null,
      "travelPace": "walking",
      "background": "Born to the salvage-quays of Tidewrack; took the Tide-Warden’s chair when her mother drowned diving the old warship. Knows every reef, tide, and pass-stone between the cove and the March.",
      "personality": "Salt-dry, unbending, slow to trust a lander.",
      "goals": "Keep Tidewrack free and fed — and the pass open — without ever bending knee to Saltspur.",
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
      "dehydrationDays": 0,
      "coins": {
        "pp": 0,
        "gp": 1200,
        "ep": 0,
        "sp": 0,
        "cp": 0
      }
    },
    {
      "schemaVersion": 2,
      "id": "chr-pass-warden",
      "name": "Pellam Stoneknee, Warden of the Pass",
      "liegeCharacterId": null,
      "class": "Explorer",
      "level": 4,
      "xp": 18000,
      "alignment": "N",
      "abilities": {
        "STR": 12,
        "INT": 11,
        "DEX": 15,
        "CON": 13,
        "CHA": 9,
        "WIL": 12
      },
      "hp": {
        "current": 17,
        "max": 17,
        "hitDice": "4d6"
      },
      "monthlyWage": 0,
      "loyalty": 2,
      "morale": 0,
      "henchmanCap": 4,
      "proficiencies": [
        "Navigation",
        "Survival",
        "Mountaineering",
        "Tracking"
      ],
      "classPowers": [
        "Pathfinding",
        "Animal Reflexes"
      ],
      "inventory": [],
      "background": "A pass-village man, bow-legged from a lifetime on the switchbacks. Guides caravans over the Saltspur Pass for a fee and patches the Auran road each spring. Will not set foot in the Deepwood for any price.",
      "currentHexId": "hex-the-pass",
      "history": [],
      "loyaltyHistory": [],
      "alive": true,
      "autoAdvance": true,
      "constructionSupervisorCap": 0,
      "mercantileNetwork": [],
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
      "dehydrationDays": 0,
      "coins": {
        "pp": 0,
        "gp": 140,
        "ep": 0,
        "sp": 0,
        "cp": 0
      },
      "personalGp": 140,
      "race": "human",
      "ac": 4,
      "currentDomainId": null,
      "personality": "Taciturn, dependable, superstitious about the high trees.",
      "goals": "Keep the pass-road sound and walk every caravan across alive.",
      "relationships": [],
      "secrets": "",
      "earningsLedger": [],
      "partyId": null,
      "travelDestination": null,
      "deceasedTurn": null
    },
    {
      "schemaVersion": 2,
      "id": "chr-saltwidow",
      "name": "Mother Oye, the Saltwidow",
      "alignment": "N",
      "race": "human",
      "class": "Cleric",
      "level": 5,
      "xp": 25000,
      "hp": {
        "current": 19,
        "max": 19,
        "hitDice": "5d6"
      },
      "ac": 2,
      "attackThrow": 9,
      "abilities": {
        "STR": 9,
        "INT": 13,
        "DEX": 10,
        "CON": 12,
        "CHA": 15,
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
        "Healing",
        "Prophecy",
        "Theology",
        "Diplomacy",
        "Knowledge (History)"
      ],
      "classPowers": [],
      "henchmanCap": 3,
      "inventory": [],
      "personalGp": 200,
      "currentHexId": "hex-tidewrack-cove",
      "currentDomainId": "dom-tidewrack",
      "partyId": null,
      "travelDestination": null,
      "travelPace": "walking",
      "background": "Keeper of the drowned Auran shrine on Tidewrack’s last standing mole. Widowed thrice by the sea, she reads the tides and the amber, and the town brings her every rumor that comes up the pass.",
      "personality": "Gentle, sea-grey, and unsettlingly certain.",
      "goals": "Tend the drowned shrine and ferry Tidewrack’s dead to a dry grave before the water claims the rest of the town.",
      "relationships": [],
      "secrets": "",
      "voice": "Soft, deliberate.",
      "liegeCharacterId": null,
      "loyalty": 0,
      "monthlyWage": 0,
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
      "dehydrationDays": 0,
      "coins": {
        "pp": 0,
        "gp": 200,
        "ep": 0,
        "sp": 0,
        "cp": 0
      }
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
        "q": 7,
        "r": 3
      },
      "classification": "Borderlands",
      "explored": true,
      "families": 180,
      "valuePerFamily": 7,
      "landImprovementBonus": 1,
      "landImprovementProjects": [],
      "terrain": "coast",
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
      "notes": "The seat of the March — Saltspur, a salt-grey keep-town on the sea, where Aelric Bran holds the frontier.",
      "domainId": "dom-march-of-saltspur",
      "economyType": "agricultural",
      "terrainTransformationState": null,
      "hasRoad": true,
      "hasTrail": false,
      "elevationFt": 0,
      "name": "Saltspur",
      "roadSides": [
        3
      ]
    },
    {
      "schemaVersion": 2,
      "id": "hex-saltspur-fields",
      "coord": {
        "q": 7,
        "r": 2
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
      "notes": "Open grain-fields and pasture under the eye of the keep.",
      "domainId": "dom-march-of-saltspur",
      "landImprovementInvested": 12500,
      "economyType": "agricultural",
      "terrainTransformationState": null,
      "hasRoad": false,
      "hasTrail": false,
      "elevationFt": 0,
      "name": "Saltspur Fields"
    },
    {
      "schemaVersion": 2,
      "id": "hex-saltpans",
      "coord": {
        "q": 6,
        "r": 3
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
      "notes": "The brine-flats and salt-houses that give the March its name and half its coin.",
      "domainId": "dom-march-of-saltspur",
      "economyType": "agricultural",
      "terrainTransformationState": null,
      "hasRoad": true,
      "hasTrail": false,
      "elevationFt": 0,
      "name": "The Saltpans",
      "roadSides": [
        0,
        3
      ]
    },
    {
      "schemaVersion": 2,
      "id": "hex-coastal-march",
      "coord": {
        "q": 6,
        "r": 2
      },
      "classification": "Borderlands",
      "explored": true,
      "families": 70,
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
      "notes": "The well-tilled vale behind Saltspur — the March’s breadbasket.",
      "domainId": "dom-march-of-saltspur",
      "economyType": "agricultural",
      "terrainTransformationState": null,
      "hasRoad": false,
      "hasTrail": false,
      "elevationFt": 0,
      "name": "Saltspur Vale"
    },
    {
      "schemaVersion": 2,
      "id": "hex-northwatch-tower",
      "coord": {
        "q": 6,
        "r": 1
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
      "notes": "A stone watch-tower over the northern hills, guarding the inland approach. Baron Yorick’s seat.",
      "domainId": "dom-barony-northwatch",
      "economyType": "agricultural",
      "terrainTransformationState": null,
      "hasRoad": false,
      "hasTrail": false,
      "elevationFt": 0,
      "name": "Northwatch Tower"
    },
    {
      "schemaVersion": 2,
      "id": "hex-northwatch-farms",
      "coord": {
        "q": 5,
        "r": 1
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
      "notes": "Hill-pasture and barley under Northwatch — and the drove-roads the Grey Pack haunts.",
      "domainId": "dom-barony-northwatch",
      "economyType": "agricultural",
      "terrainTransformationState": null,
      "hasRoad": false,
      "hasTrail": false,
      "elevationFt": 0,
      "name": "Northwatch Farms"
    },
    {
      "schemaVersion": 2,
      "id": "hex-saltcombe-shrine",
      "coord": {
        "q": 5,
        "r": 3
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
      "notes": "A snug coastal town around an old shrine; Lady Mira keeps it, and quietly keeps its tithes.",
      "domainId": "dom-barony-saltcombe",
      "economyType": "agricultural",
      "terrainTransformationState": null,
      "hasRoad": true,
      "hasTrail": false,
      "elevationFt": 0,
      "name": "Saltcombe",
      "roadSides": [
        0,
        3
      ]
    },
    {
      "schemaVersion": 2,
      "id": "hex-saltcombe-fields",
      "coord": {
        "q": 5,
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
      "notes": "The combe’s sheltered fields, the last tilled land before the coast turns wild.",
      "domainId": "dom-barony-saltcombe",
      "economyType": "agricultural",
      "terrainTransformationState": null,
      "hasRoad": false,
      "hasTrail": false,
      "elevationFt": 0,
      "name": "Saltcombe Fields"
    },
    {
      "schemaVersion": 2,
      "id": "hex-buf-n0",
      "coord": {
        "q": 0,
        "r": 0
      },
      "classification": "Borderlands",
      "explored": true,
      "families": 0,
      "valuePerFamily": 6,
      "landImprovementBonus": 0,
      "landImprovementInvested": 0,
      "landImprovementProjects": [],
      "queuedImprovementGp": 0,
      "improvementBudgetGp": 0,
      "constructionSupervisorCharacterIds": [],
      "terrain": "mountains",
      "hasRoad": false,
      "hasTrail": false,
      "roadSides": [],
      "riverSides": [],
      "crossingSides": [],
      "elevationFt": 0,
      "groundCondition": "clear",
      "hasLake": false,
      "freshWater": false,
      "primaryStructure": "",
      "settlement": null,
      "lairs": [],
      "dungeons": [],
      "pointsOfInterest": [],
      "monsterNotes": "",
      "notes": "",
      "economyType": "agricultural",
      "terrainTransformationState": null,
      "name": "",
      "domainId": null
    },
    {
      "schemaVersion": 2,
      "id": "hex-buf-n1",
      "coord": {
        "q": 1,
        "r": 0
      },
      "classification": "Borderlands",
      "explored": true,
      "families": 0,
      "valuePerFamily": 6,
      "landImprovementBonus": 0,
      "landImprovementInvested": 0,
      "landImprovementProjects": [],
      "queuedImprovementGp": 0,
      "improvementBudgetGp": 0,
      "constructionSupervisorCharacterIds": [],
      "terrain": "mountains",
      "hasRoad": false,
      "hasTrail": false,
      "roadSides": [],
      "riverSides": [],
      "crossingSides": [],
      "elevationFt": 0,
      "groundCondition": "clear",
      "hasLake": false,
      "freshWater": false,
      "primaryStructure": "",
      "settlement": null,
      "lairs": [],
      "dungeons": [],
      "pointsOfInterest": [],
      "monsterNotes": "",
      "notes": "The bare crest of the Saltspur range, snow-capped half the year.",
      "economyType": "agricultural",
      "terrainTransformationState": null,
      "name": "The Saltspur Heights",
      "domainId": null
    },
    {
      "schemaVersion": 2,
      "id": "hex-buf-n2",
      "coord": {
        "q": 2,
        "r": 0
      },
      "classification": "Borderlands",
      "explored": true,
      "families": 0,
      "valuePerFamily": 6,
      "landImprovementBonus": 0,
      "landImprovementInvested": 0,
      "landImprovementProjects": [],
      "queuedImprovementGp": 0,
      "improvementBudgetGp": 0,
      "constructionSupervisorCharacterIds": [],
      "terrain": "hills",
      "hasRoad": false,
      "hasTrail": false,
      "roadSides": [],
      "riverSides": [],
      "crossingSides": [],
      "elevationFt": 0,
      "groundCondition": "clear",
      "hasLake": false,
      "freshWater": false,
      "primaryStructure": "",
      "settlement": null,
      "lairs": [],
      "dungeons": [],
      "pointsOfInterest": [],
      "monsterNotes": "",
      "notes": "",
      "economyType": "agricultural",
      "terrainTransformationState": null,
      "name": "",
      "domainId": null
    },
    {
      "schemaVersion": 2,
      "id": "hex-buf-n3",
      "coord": {
        "q": 3,
        "r": 0
      },
      "classification": "Borderlands",
      "explored": true,
      "families": 0,
      "valuePerFamily": 6,
      "landImprovementBonus": 0,
      "landImprovementInvested": 0,
      "landImprovementProjects": [],
      "queuedImprovementGp": 0,
      "improvementBudgetGp": 0,
      "constructionSupervisorCharacterIds": [],
      "terrain": "forest",
      "hasRoad": false,
      "hasTrail": false,
      "roadSides": [],
      "riverSides": [],
      "crossingSides": [],
      "elevationFt": 0,
      "groundCondition": "clear",
      "hasLake": false,
      "freshWater": false,
      "primaryStructure": "",
      "settlement": null,
      "lairs": [],
      "dungeons": [],
      "pointsOfInterest": [],
      "monsterNotes": "",
      "notes": "Trackless green marches along the northern bound of the March — no lord’s writ runs here.",
      "economyType": "agricultural",
      "terrainTransformationState": null,
      "name": "The Greenwood Marches",
      "domainId": null
    },
    {
      "schemaVersion": 2,
      "id": "hex-buf-n4",
      "coord": {
        "q": 4,
        "r": 0
      },
      "classification": "Borderlands",
      "explored": true,
      "families": 0,
      "valuePerFamily": 6,
      "landImprovementBonus": 0,
      "landImprovementInvested": 0,
      "landImprovementProjects": [],
      "queuedImprovementGp": 0,
      "improvementBudgetGp": 0,
      "constructionSupervisorCharacterIds": [],
      "terrain": "hills",
      "hasRoad": false,
      "hasTrail": false,
      "roadSides": [],
      "riverSides": [],
      "crossingSides": [],
      "elevationFt": 0,
      "groundCondition": "clear",
      "hasLake": false,
      "freshWater": false,
      "primaryStructure": "",
      "settlement": null,
      "lairs": [],
      "dungeons": [],
      "pointsOfInterest": [],
      "monsterNotes": "",
      "notes": "",
      "economyType": "agricultural",
      "terrainTransformationState": null,
      "name": "",
      "domainId": null
    },
    {
      "schemaVersion": 2,
      "id": "hex-buf-n5",
      "coord": {
        "q": 5,
        "r": 0
      },
      "classification": "Borderlands",
      "explored": true,
      "families": 0,
      "valuePerFamily": 6,
      "landImprovementBonus": 0,
      "landImprovementInvested": 0,
      "landImprovementProjects": [],
      "queuedImprovementGp": 0,
      "improvementBudgetGp": 0,
      "constructionSupervisorCharacterIds": [],
      "terrain": "forest",
      "hasRoad": false,
      "hasTrail": false,
      "roadSides": [],
      "riverSides": [],
      "crossingSides": [],
      "elevationFt": 0,
      "groundCondition": "clear",
      "hasLake": false,
      "freshWater": false,
      "primaryStructure": "",
      "settlement": null,
      "lairs": [],
      "dungeons": [],
      "pointsOfInterest": [],
      "monsterNotes": "",
      "notes": "",
      "economyType": "agricultural",
      "terrainTransformationState": null,
      "name": "",
      "domainId": null
    },
    {
      "schemaVersion": 2,
      "id": "hex-buf-n6",
      "coord": {
        "q": 6,
        "r": 0
      },
      "classification": "Borderlands",
      "explored": true,
      "families": 0,
      "valuePerFamily": 6,
      "landImprovementBonus": 0,
      "landImprovementInvested": 0,
      "landImprovementProjects": [],
      "queuedImprovementGp": 0,
      "improvementBudgetGp": 0,
      "constructionSupervisorCharacterIds": [],
      "terrain": "hills",
      "hasRoad": false,
      "hasTrail": false,
      "roadSides": [],
      "riverSides": [],
      "crossingSides": [],
      "elevationFt": 0,
      "groundCondition": "clear",
      "hasLake": false,
      "freshWater": false,
      "primaryStructure": "",
      "settlement": null,
      "lairs": [],
      "dungeons": [],
      "pointsOfInterest": [],
      "monsterNotes": "",
      "notes": "",
      "economyType": "agricultural",
      "terrainTransformationState": null,
      "name": "",
      "domainId": null
    },
    {
      "schemaVersion": 2,
      "id": "hex-buf-n7",
      "coord": {
        "q": 7,
        "r": 0
      },
      "classification": "Borderlands",
      "explored": true,
      "families": 0,
      "valuePerFamily": 6,
      "landImprovementBonus": 0,
      "landImprovementInvested": 0,
      "landImprovementProjects": [],
      "queuedImprovementGp": 0,
      "improvementBudgetGp": 0,
      "constructionSupervisorCharacterIds": [],
      "terrain": "forest",
      "hasRoad": false,
      "hasTrail": false,
      "roadSides": [],
      "riverSides": [],
      "crossingSides": [],
      "elevationFt": 0,
      "groundCondition": "clear",
      "hasLake": false,
      "freshWater": false,
      "primaryStructure": "",
      "settlement": null,
      "lairs": [],
      "dungeons": [],
      "pointsOfInterest": [],
      "monsterNotes": "",
      "notes": "",
      "economyType": "agricultural",
      "terrainTransformationState": null,
      "name": "",
      "domainId": null
    },
    {
      "schemaVersion": 2,
      "id": "hex-buf-n8",
      "coord": {
        "q": 8,
        "r": 0
      },
      "classification": "Borderlands",
      "explored": true,
      "families": 0,
      "valuePerFamily": 6,
      "landImprovementBonus": 0,
      "landImprovementInvested": 0,
      "landImprovementProjects": [],
      "queuedImprovementGp": 0,
      "improvementBudgetGp": 0,
      "constructionSupervisorCharacterIds": [],
      "terrain": "hills",
      "hasRoad": false,
      "hasTrail": false,
      "roadSides": [],
      "riverSides": [],
      "crossingSides": [],
      "elevationFt": 0,
      "groundCondition": "clear",
      "hasLake": false,
      "freshWater": false,
      "primaryStructure": "",
      "settlement": null,
      "lairs": [],
      "dungeons": [],
      "pointsOfInterest": [],
      "monsterNotes": "",
      "notes": "",
      "economyType": "agricultural",
      "terrainTransformationState": null,
      "name": "",
      "domainId": null
    },
    {
      "schemaVersion": 2,
      "id": "hex-buf-w1",
      "coord": {
        "q": 0,
        "r": 1
      },
      "classification": "Borderlands",
      "explored": true,
      "families": 0,
      "valuePerFamily": 6,
      "landImprovementBonus": 0,
      "landImprovementInvested": 0,
      "landImprovementProjects": [],
      "queuedImprovementGp": 0,
      "improvementBudgetGp": 0,
      "constructionSupervisorCharacterIds": [],
      "terrain": "hills",
      "hasRoad": false,
      "hasTrail": false,
      "roadSides": [],
      "riverSides": [],
      "crossingSides": [],
      "elevationFt": 0,
      "groundCondition": "clear",
      "hasLake": false,
      "freshWater": false,
      "primaryStructure": "",
      "settlement": null,
      "lairs": [],
      "dungeons": [],
      "pointsOfInterest": [],
      "monsterNotes": "",
      "notes": "",
      "economyType": "agricultural",
      "terrainTransformationState": null,
      "name": "",
      "domainId": null
    },
    {
      "schemaVersion": 2,
      "id": "hex-pass-approach",
      "coord": {
        "q": 1,
        "r": 1
      },
      "classification": "Borderlands",
      "explored": true,
      "families": 0,
      "valuePerFamily": 6,
      "landImprovementBonus": 0,
      "landImprovementInvested": 0,
      "landImprovementProjects": [],
      "queuedImprovementGp": 0,
      "improvementBudgetGp": 0,
      "constructionSupervisorCharacterIds": [],
      "terrain": "mountains",
      "hasRoad": false,
      "hasTrail": false,
      "roadSides": [],
      "riverSides": [],
      "crossingSides": [],
      "elevationFt": 0,
      "groundCondition": "clear",
      "hasLake": false,
      "freshWater": false,
      "primaryStructure": "",
      "settlement": null,
      "lairs": [],
      "dungeons": [],
      "pointsOfInterest": [],
      "monsterNotes": "",
      "notes": "The bare crown of the Saltspur range — too high and broken for any road; the pass below is the only way through.",
      "economyType": "agricultural",
      "terrainTransformationState": null,
      "name": "The High Saltspur",
      "domainId": null
    },
    {
      "schemaVersion": 2,
      "id": "hex-range-2",
      "coord": {
        "q": 2,
        "r": 1
      },
      "classification": "Borderlands",
      "explored": true,
      "families": 0,
      "valuePerFamily": 6,
      "landImprovementBonus": 0,
      "landImprovementInvested": 0,
      "landImprovementProjects": [],
      "queuedImprovementGp": 0,
      "improvementBudgetGp": 0,
      "constructionSupervisorCharacterIds": [],
      "terrain": "mountains",
      "hasRoad": false,
      "hasTrail": false,
      "roadSides": [],
      "riverSides": [],
      "crossingSides": [],
      "elevationFt": 0,
      "groundCondition": "clear",
      "hasLake": false,
      "freshWater": false,
      "primaryStructure": "",
      "settlement": null,
      "lairs": [],
      "dungeons": [],
      "pointsOfInterest": [],
      "monsterNotes": "",
      "notes": "",
      "economyType": "agricultural",
      "terrainTransformationState": null,
      "name": "",
      "domainId": null
    },
    {
      "schemaVersion": 2,
      "id": "hex-inland-3",
      "coord": {
        "q": 3,
        "r": 1
      },
      "classification": "Borderlands",
      "explored": true,
      "families": 0,
      "valuePerFamily": 6,
      "landImprovementBonus": 0,
      "landImprovementInvested": 0,
      "landImprovementProjects": [],
      "queuedImprovementGp": 0,
      "improvementBudgetGp": 0,
      "constructionSupervisorCharacterIds": [],
      "terrain": "hills",
      "hasRoad": false,
      "hasTrail": false,
      "roadSides": [],
      "riverSides": [],
      "crossingSides": [],
      "elevationFt": 0,
      "groundCondition": "clear",
      "hasLake": false,
      "freshWater": false,
      "primaryStructure": "",
      "settlement": null,
      "lairs": [],
      "dungeons": [],
      "pointsOfInterest": [],
      "monsterNotes": "",
      "notes": "",
      "economyType": "agricultural",
      "terrainTransformationState": null,
      "name": "",
      "domainId": null
    },
    {
      "schemaVersion": 2,
      "id": "hex-inland-4",
      "coord": {
        "q": 4,
        "r": 1
      },
      "classification": "Borderlands",
      "explored": true,
      "families": 0,
      "valuePerFamily": 6,
      "landImprovementBonus": 0,
      "landImprovementInvested": 0,
      "landImprovementProjects": [],
      "queuedImprovementGp": 0,
      "improvementBudgetGp": 0,
      "constructionSupervisorCharacterIds": [],
      "terrain": "scrubland",
      "hasRoad": false,
      "hasTrail": false,
      "roadSides": [],
      "riverSides": [],
      "crossingSides": [],
      "elevationFt": 0,
      "groundCondition": "clear",
      "hasLake": false,
      "freshWater": false,
      "primaryStructure": "",
      "settlement": null,
      "lairs": [],
      "dungeons": [],
      "pointsOfInterest": [],
      "monsterNotes": "",
      "notes": "",
      "economyType": "agricultural",
      "terrainTransformationState": null,
      "name": "",
      "domainId": null
    },
    {
      "schemaVersion": 2,
      "id": "hex-wolfden-hills",
      "coord": {
        "q": 7,
        "r": 1
      },
      "classification": "Borderlands",
      "explored": true,
      "families": 0,
      "valuePerFamily": 6,
      "landImprovementBonus": 0,
      "landImprovementInvested": 0,
      "landImprovementProjects": [],
      "queuedImprovementGp": 0,
      "improvementBudgetGp": 0,
      "constructionSupervisorCharacterIds": [],
      "terrain": "hills",
      "hasRoad": false,
      "hasTrail": false,
      "roadSides": [],
      "riverSides": [],
      "crossingSides": [],
      "elevationFt": 0,
      "groundCondition": "clear",
      "hasLake": false,
      "freshWater": false,
      "primaryStructure": "",
      "settlement": null,
      "lairs": [],
      "dungeons": [],
      "pointsOfInterest": [],
      "monsterNotes": "Lair of the Grey Pack — dire wolves that take calves, and in hard winters herders, from the Northwatch pastures.",
      "notes": "Old cairn-hills above the Northwatch drives; shepherds leave a culled ewe on the boundary-stone and are home before dusk.",
      "economyType": "agricultural",
      "terrainTransformationState": null,
      "name": "Wolfden Hills",
      "domainId": null
    },
    {
      "schemaVersion": 2,
      "id": "hex-buf-e1",
      "coord": {
        "q": 8,
        "r": 1
      },
      "classification": "Borderlands",
      "explored": true,
      "families": 0,
      "valuePerFamily": 6,
      "landImprovementBonus": 0,
      "landImprovementInvested": 0,
      "landImprovementProjects": [],
      "queuedImprovementGp": 0,
      "improvementBudgetGp": 0,
      "constructionSupervisorCharacterIds": [],
      "terrain": "hills",
      "hasRoad": false,
      "hasTrail": false,
      "roadSides": [],
      "riverSides": [],
      "crossingSides": [],
      "elevationFt": 0,
      "groundCondition": "clear",
      "hasLake": false,
      "freshWater": false,
      "primaryStructure": "",
      "settlement": null,
      "lairs": [],
      "dungeons": [],
      "pointsOfInterest": [],
      "monsterNotes": "",
      "notes": "",
      "economyType": "agricultural",
      "terrainTransformationState": null,
      "name": "",
      "domainId": null
    },
    {
      "schemaVersion": 2,
      "id": "hex-buf-w2",
      "coord": {
        "q": 0,
        "r": 2
      },
      "classification": "Borderlands",
      "explored": true,
      "families": 0,
      "valuePerFamily": 6,
      "landImprovementBonus": 0,
      "landImprovementInvested": 0,
      "landImprovementProjects": [],
      "queuedImprovementGp": 0,
      "improvementBudgetGp": 0,
      "constructionSupervisorCharacterIds": [],
      "terrain": "scrubland",
      "hasRoad": false,
      "hasTrail": false,
      "roadSides": [],
      "riverSides": [],
      "crossingSides": [],
      "elevationFt": 0,
      "groundCondition": "clear",
      "hasLake": false,
      "freshWater": false,
      "primaryStructure": "",
      "settlement": null,
      "lairs": [],
      "dungeons": [],
      "pointsOfInterest": [],
      "monsterNotes": "",
      "notes": "",
      "economyType": "agricultural",
      "terrainTransformationState": null,
      "name": "",
      "domainId": null
    },
    {
      "schemaVersion": 2,
      "id": "hex-tidewrack-strand",
      "coord": {
        "q": 1,
        "r": 2
      },
      "classification": "Borderlands",
      "explored": true,
      "families": 120,
      "valuePerFamily": 6,
      "landImprovementBonus": 0,
      "landImprovementInvested": 0,
      "landImprovementProjects": [],
      "queuedImprovementGp": 0,
      "improvementBudgetGp": 0,
      "constructionSupervisorCharacterIds": [],
      "terrain": "coast",
      "hasRoad": false,
      "hasTrail": false,
      "roadSides": [],
      "riverSides": [],
      "crossingSides": [],
      "elevationFt": 0,
      "groundCondition": "clear",
      "hasLake": false,
      "freshWater": false,
      "primaryStructure": "",
      "settlement": null,
      "lairs": [],
      "dungeons": [],
      "pointsOfInterest": [],
      "monsterNotes": "",
      "notes": "The amber-strand and salt-fish flats that feed Tidewrack — grey amber comes up here after westerly storms.",
      "economyType": "agricultural",
      "terrainTransformationState": null,
      "name": "Tidewrack Strand",
      "domainId": "dom-tidewrack"
    },
    {
      "schemaVersion": 2,
      "id": "hex-deepwood",
      "coord": {
        "q": 2,
        "r": 2
      },
      "classification": "Borderlands",
      "explored": true,
      "families": 0,
      "valuePerFamily": 6,
      "landImprovementBonus": 0,
      "landImprovementInvested": 0,
      "landImprovementProjects": [],
      "queuedImprovementGp": 0,
      "improvementBudgetGp": 0,
      "constructionSupervisorCharacterIds": [],
      "terrain": "forest",
      "hasRoad": false,
      "hasTrail": false,
      "roadSides": [],
      "riverSides": [],
      "crossingSides": [],
      "elevationFt": 0,
      "groundCondition": "clear",
      "hasLake": true,
      "freshWater": false,
      "primaryStructure": "",
      "settlement": null,
      "lairs": [],
      "dungeons": [],
      "pointsOfInterest": [],
      "monsterNotes": "Lair of the Deepwood Weavers — giant spiders that web the dark trees and take the stragglers off the pass-road.",
      "notes": "Dark coastal pine crowding the south flank of the pass. A black tarn at its heart never freezes; caravan-folk hang cold iron at the treeline.",
      "economyType": "agricultural",
      "terrainTransformationState": null,
      "name": "The Deepwood",
      "domainId": null
    },
    {
      "schemaVersion": 2,
      "id": "hex-saltmarsh",
      "coord": {
        "q": 3,
        "r": 2
      },
      "classification": "Borderlands",
      "explored": true,
      "families": 0,
      "valuePerFamily": 6,
      "landImprovementBonus": 0,
      "landImprovementInvested": 0,
      "landImprovementProjects": [],
      "queuedImprovementGp": 0,
      "improvementBudgetGp": 0,
      "constructionSupervisorCharacterIds": [],
      "terrain": "swamp",
      "hasRoad": false,
      "hasTrail": false,
      "roadSides": [],
      "riverSides": [],
      "crossingSides": [],
      "elevationFt": 0,
      "groundCondition": "clear",
      "hasLake": false,
      "freshWater": false,
      "primaryStructure": "",
      "settlement": null,
      "lairs": [],
      "dungeons": [],
      "pointsOfInterest": [],
      "monsterNotes": "Lair of the Mere-Folk — marsh-lizardfolk who hold the drowned Auran causeway and suffer no one to dig the road.",
      "notes": "A drowned reach of salt-fen where an Auran causeway sinks rib by rib into the brackish mud. No drink for traveller or beast.",
      "economyType": "agricultural",
      "terrainTransformationState": null,
      "name": "The Saltmarsh",
      "domainId": null
    },
    {
      "schemaVersion": 2,
      "id": "hex-wild-scrub",
      "coord": {
        "q": 4,
        "r": 2
      },
      "classification": "Borderlands",
      "explored": true,
      "families": 0,
      "valuePerFamily": 6,
      "landImprovementBonus": 0,
      "landImprovementInvested": 0,
      "landImprovementProjects": [],
      "queuedImprovementGp": 0,
      "improvementBudgetGp": 0,
      "constructionSupervisorCharacterIds": [],
      "terrain": "scrubland",
      "hasRoad": false,
      "hasTrail": false,
      "roadSides": [],
      "riverSides": [],
      "crossingSides": [],
      "elevationFt": 0,
      "groundCondition": "clear",
      "hasLake": false,
      "freshWater": false,
      "primaryStructure": "",
      "settlement": null,
      "lairs": [],
      "dungeons": [],
      "pointsOfInterest": [],
      "monsterNotes": "",
      "notes": "Thorn and gorse climbing from the coast toward the range, broken by old Auran mile-stones the road still follows.",
      "economyType": "agricultural",
      "terrainTransformationState": null,
      "name": "Thornreach",
      "domainId": null
    },
    {
      "schemaVersion": 2,
      "id": "hex-buf-e2",
      "coord": {
        "q": 8,
        "r": 2
      },
      "classification": "Borderlands",
      "explored": true,
      "families": 0,
      "valuePerFamily": 6,
      "landImprovementBonus": 0,
      "landImprovementInvested": 0,
      "landImprovementProjects": [],
      "queuedImprovementGp": 0,
      "improvementBudgetGp": 0,
      "constructionSupervisorCharacterIds": [],
      "terrain": "hills",
      "hasRoad": false,
      "hasTrail": false,
      "roadSides": [],
      "riverSides": [],
      "crossingSides": [],
      "elevationFt": 0,
      "groundCondition": "clear",
      "hasLake": false,
      "freshWater": false,
      "primaryStructure": "",
      "settlement": null,
      "lairs": [],
      "dungeons": [],
      "pointsOfInterest": [],
      "monsterNotes": "",
      "notes": "",
      "economyType": "agricultural",
      "terrainTransformationState": null,
      "name": "",
      "domainId": null
    },
    {
      "schemaVersion": 2,
      "id": "hex-buf-w3",
      "coord": {
        "q": 0,
        "r": 3
      },
      "classification": "Borderlands",
      "explored": true,
      "families": 0,
      "valuePerFamily": 6,
      "landImprovementBonus": 0,
      "landImprovementInvested": 0,
      "landImprovementProjects": [],
      "queuedImprovementGp": 0,
      "improvementBudgetGp": 0,
      "constructionSupervisorCharacterIds": [],
      "terrain": "coast",
      "hasRoad": false,
      "hasTrail": false,
      "roadSides": [],
      "riverSides": [],
      "crossingSides": [],
      "elevationFt": 0,
      "groundCondition": "clear",
      "hasLake": false,
      "freshWater": false,
      "primaryStructure": "",
      "settlement": null,
      "lairs": [],
      "dungeons": [],
      "pointsOfInterest": [],
      "monsterNotes": "",
      "notes": "",
      "economyType": "agricultural",
      "terrainTransformationState": null,
      "name": "",
      "domainId": null
    },
    {
      "schemaVersion": 2,
      "id": "hex-tidewrack-cove",
      "coord": {
        "q": 1,
        "r": 3
      },
      "classification": "Borderlands",
      "explored": true,
      "families": 0,
      "valuePerFamily": 6,
      "landImprovementBonus": 0,
      "landImprovementInvested": 0,
      "landImprovementProjects": [],
      "queuedImprovementGp": 0,
      "improvementBudgetGp": 0,
      "constructionSupervisorCharacterIds": [],
      "terrain": "coast",
      "hasRoad": true,
      "hasTrail": false,
      "roadSides": [
        0
      ],
      "riverSides": [],
      "crossingSides": [],
      "elevationFt": 0,
      "groundCondition": "clear",
      "hasLake": false,
      "freshWater": false,
      "primaryStructure": "",
      "settlement": {
        "schemaVersion": 2,
        "id": "set-tidewrack",
        "name": "Tidewrack",
        "families": 85,
        "totalInvestment": 10000,
        "foundedTurn": 1,
        "foundedByCharacterId": null,
        "demandModifiers": {},
        "placesOfPower": [],
        "rumors": [],
        "entryways": [],
        "regulatedAssets": [],
        "notes": "A salvage-port of salt-fishers, amber-gatherers, and wreck-divers on the bones of an Auran naval station. The inner harbour drowns an old warship; the Saltwidow’s shrine stands on the one Auran mole still above the tide.",
        "hexId": "hex-tidewrack-cove",
        "marketClass": "VI"
      },
      "lairs": [],
      "dungeons": [],
      "pointsOfInterest": [],
      "monsterNotes": "",
      "notes": "A deep, sheltered cove over a half-drowned Auran naval station; at low water the masts of an old warship break the inner harbour. The free town of Tidewrack clings to the salvage-quays.",
      "economyType": "agricultural",
      "terrainTransformationState": null,
      "name": "Tidewrack Cove",
      "domainId": "dom-tidewrack"
    },
    {
      "schemaVersion": 2,
      "id": "hex-pass-descent",
      "coord": {
        "q": 2,
        "r": 3
      },
      "classification": "Borderlands",
      "explored": true,
      "families": 0,
      "valuePerFamily": 6,
      "landImprovementBonus": 0,
      "landImprovementInvested": 0,
      "landImprovementProjects": [],
      "queuedImprovementGp": 0,
      "improvementBudgetGp": 0,
      "constructionSupervisorCharacterIds": [],
      "terrain": "hills",
      "hasRoad": true,
      "hasTrail": false,
      "roadSides": [
        0,
        3
      ],
      "riverSides": [],
      "crossingSides": [],
      "elevationFt": 0,
      "groundCondition": "clear",
      "hasLake": true,
      "freshWater": false,
      "primaryStructure": "",
      "settlement": null,
      "lairs": [],
      "dungeons": [],
      "pointsOfInterest": [],
      "monsterNotes": "",
      "notes": "The western descent into broken hill-country, watered by snowmelt tarns. The first sight of Tidewrack’s smoke opens here.",
      "economyType": "agricultural",
      "terrainTransformationState": null,
      "name": "The Westfall",
      "domainId": null
    },
    {
      "schemaVersion": 2,
      "id": "hex-the-pass",
      "coord": {
        "q": 3,
        "r": 3
      },
      "classification": "Borderlands",
      "explored": true,
      "families": 0,
      "valuePerFamily": 6,
      "landImprovementBonus": 0,
      "landImprovementInvested": 0,
      "landImprovementProjects": [],
      "queuedImprovementGp": 0,
      "improvementBudgetGp": 0,
      "constructionSupervisorCharacterIds": [],
      "terrain": "mountains",
      "hasRoad": true,
      "hasTrail": true,
      "roadSides": [
        0,
        3
      ],
      "riverSides": [],
      "crossingSides": [],
      "elevationFt": 0,
      "groundCondition": "clear",
      "hasLake": false,
      "freshWater": false,
      "primaryStructure": "",
      "settlement": null,
      "lairs": [],
      "dungeons": [],
      "pointsOfInterest": [],
      "monsterNotes": "",
      "notes": "The high pass over the Saltspur range — the only land road west to Tidewrack. A pass-stone at the summit marks the old bound of the March.",
      "economyType": "agricultural",
      "terrainTransformationState": null,
      "name": "The Saltspur Pass",
      "domainId": null
    },
    {
      "schemaVersion": 2,
      "id": "hex-wild-coast",
      "coord": {
        "q": 4,
        "r": 3
      },
      "classification": "Borderlands",
      "explored": true,
      "families": 0,
      "valuePerFamily": 6,
      "landImprovementBonus": 0,
      "landImprovementInvested": 0,
      "landImprovementProjects": [],
      "queuedImprovementGp": 0,
      "improvementBudgetGp": 0,
      "constructionSupervisorCharacterIds": [],
      "terrain": "coast",
      "hasRoad": true,
      "hasTrail": false,
      "roadSides": [
        0,
        3
      ],
      "riverSides": [],
      "crossingSides": [],
      "elevationFt": 0,
      "groundCondition": "clear",
      "hasLake": false,
      "freshWater": false,
      "primaryStructure": "",
      "settlement": null,
      "lairs": [],
      "dungeons": [],
      "pointsOfInterest": [],
      "monsterNotes": "",
      "notes": "A wild, wreck-strewn shore west of Saltcombe — the Wrack, where the tides pile timber and rigging. No fresh water until the high streams.",
      "economyType": "agricultural",
      "terrainTransformationState": null,
      "name": "The Wrack",
      "domainId": null
    },
    {
      "schemaVersion": 2,
      "id": "hex-buf-e3",
      "coord": {
        "q": 8,
        "r": 3
      },
      "classification": "Borderlands",
      "explored": true,
      "families": 0,
      "valuePerFamily": 6,
      "landImprovementBonus": 0,
      "landImprovementInvested": 0,
      "landImprovementProjects": [],
      "queuedImprovementGp": 0,
      "improvementBudgetGp": 0,
      "constructionSupervisorCharacterIds": [],
      "terrain": "coast",
      "hasRoad": false,
      "hasTrail": false,
      "roadSides": [],
      "riverSides": [],
      "crossingSides": [],
      "elevationFt": 0,
      "groundCondition": "clear",
      "hasLake": false,
      "freshWater": false,
      "primaryStructure": "",
      "settlement": null,
      "lairs": [],
      "dungeons": [],
      "pointsOfInterest": [],
      "monsterNotes": "",
      "notes": "",
      "economyType": "agricultural",
      "terrainTransformationState": null,
      "name": "",
      "domainId": null
    },
    {
      "schemaVersion": 2,
      "id": "hex-sea-0",
      "coord": {
        "q": 0,
        "r": 4
      },
      "classification": "Borderlands",
      "explored": true,
      "families": 0,
      "valuePerFamily": 6,
      "landImprovementBonus": 0,
      "landImprovementInvested": 0,
      "landImprovementProjects": [],
      "queuedImprovementGp": 0,
      "improvementBudgetGp": 0,
      "constructionSupervisorCharacterIds": [],
      "terrain": "water",
      "hasRoad": false,
      "hasTrail": false,
      "roadSides": [],
      "riverSides": [],
      "crossingSides": [],
      "elevationFt": 0,
      "groundCondition": "clear",
      "hasLake": false,
      "freshWater": false,
      "primaryStructure": "",
      "settlement": null,
      "lairs": [],
      "dungeons": [],
      "pointsOfInterest": [],
      "monsterNotes": "",
      "notes": "The open salt sea — Tidewrack’s other road, and the one the Auran ships once kept.",
      "economyType": "agricultural",
      "terrainTransformationState": null,
      "name": "The Salt Sea",
      "domainId": null
    },
    {
      "schemaVersion": 2,
      "id": "hex-sea-1",
      "coord": {
        "q": 1,
        "r": 4
      },
      "classification": "Borderlands",
      "explored": true,
      "families": 0,
      "valuePerFamily": 6,
      "landImprovementBonus": 0,
      "landImprovementInvested": 0,
      "landImprovementProjects": [],
      "queuedImprovementGp": 0,
      "improvementBudgetGp": 0,
      "constructionSupervisorCharacterIds": [],
      "terrain": "water",
      "hasRoad": false,
      "hasTrail": false,
      "roadSides": [],
      "riverSides": [],
      "crossingSides": [],
      "elevationFt": 0,
      "groundCondition": "clear",
      "hasLake": false,
      "freshWater": false,
      "primaryStructure": "",
      "settlement": null,
      "lairs": [],
      "dungeons": [],
      "pointsOfInterest": [],
      "monsterNotes": "",
      "notes": "",
      "economyType": "agricultural",
      "terrainTransformationState": null,
      "name": "",
      "domainId": null
    },
    {
      "schemaVersion": 2,
      "id": "hex-sea-2",
      "coord": {
        "q": 2,
        "r": 4
      },
      "classification": "Borderlands",
      "explored": true,
      "families": 0,
      "valuePerFamily": 6,
      "landImprovementBonus": 0,
      "landImprovementInvested": 0,
      "landImprovementProjects": [],
      "queuedImprovementGp": 0,
      "improvementBudgetGp": 0,
      "constructionSupervisorCharacterIds": [],
      "terrain": "water",
      "hasRoad": false,
      "hasTrail": false,
      "roadSides": [],
      "riverSides": [],
      "crossingSides": [],
      "elevationFt": 0,
      "groundCondition": "clear",
      "hasLake": false,
      "freshWater": false,
      "primaryStructure": "",
      "settlement": null,
      "lairs": [],
      "dungeons": [],
      "pointsOfInterest": [],
      "monsterNotes": "",
      "notes": "",
      "economyType": "agricultural",
      "terrainTransformationState": null,
      "name": "",
      "domainId": null
    },
    {
      "schemaVersion": 2,
      "id": "hex-sea-3",
      "coord": {
        "q": 3,
        "r": 4
      },
      "classification": "Borderlands",
      "explored": true,
      "families": 0,
      "valuePerFamily": 6,
      "landImprovementBonus": 0,
      "landImprovementInvested": 0,
      "landImprovementProjects": [],
      "queuedImprovementGp": 0,
      "improvementBudgetGp": 0,
      "constructionSupervisorCharacterIds": [],
      "terrain": "water",
      "hasRoad": false,
      "hasTrail": false,
      "roadSides": [],
      "riverSides": [],
      "crossingSides": [],
      "elevationFt": 0,
      "groundCondition": "clear",
      "hasLake": false,
      "freshWater": false,
      "primaryStructure": "",
      "settlement": null,
      "lairs": [],
      "dungeons": [],
      "pointsOfInterest": [],
      "monsterNotes": "",
      "notes": "",
      "economyType": "agricultural",
      "terrainTransformationState": null,
      "name": "",
      "domainId": null
    },
    {
      "schemaVersion": 2,
      "id": "hex-sea-4",
      "coord": {
        "q": 4,
        "r": 4
      },
      "classification": "Borderlands",
      "explored": true,
      "families": 0,
      "valuePerFamily": 6,
      "landImprovementBonus": 0,
      "landImprovementInvested": 0,
      "landImprovementProjects": [],
      "queuedImprovementGp": 0,
      "improvementBudgetGp": 0,
      "constructionSupervisorCharacterIds": [],
      "terrain": "water",
      "hasRoad": false,
      "hasTrail": false,
      "roadSides": [],
      "riverSides": [],
      "crossingSides": [],
      "elevationFt": 0,
      "groundCondition": "clear",
      "hasLake": false,
      "freshWater": false,
      "primaryStructure": "",
      "settlement": null,
      "lairs": [],
      "dungeons": [],
      "pointsOfInterest": [],
      "monsterNotes": "",
      "notes": "",
      "economyType": "agricultural",
      "terrainTransformationState": null,
      "name": "",
      "domainId": null
    },
    {
      "schemaVersion": 2,
      "id": "hex-sea-5",
      "coord": {
        "q": 5,
        "r": 4
      },
      "classification": "Borderlands",
      "explored": true,
      "families": 0,
      "valuePerFamily": 6,
      "landImprovementBonus": 0,
      "landImprovementInvested": 0,
      "landImprovementProjects": [],
      "queuedImprovementGp": 0,
      "improvementBudgetGp": 0,
      "constructionSupervisorCharacterIds": [],
      "terrain": "water",
      "hasRoad": false,
      "hasTrail": false,
      "roadSides": [],
      "riverSides": [],
      "crossingSides": [],
      "elevationFt": 0,
      "groundCondition": "clear",
      "hasLake": false,
      "freshWater": false,
      "primaryStructure": "",
      "settlement": null,
      "lairs": [],
      "dungeons": [],
      "pointsOfInterest": [],
      "monsterNotes": "",
      "notes": "",
      "economyType": "agricultural",
      "terrainTransformationState": null,
      "name": "",
      "domainId": null
    },
    {
      "schemaVersion": 2,
      "id": "hex-sea-6",
      "coord": {
        "q": 6,
        "r": 4
      },
      "classification": "Borderlands",
      "explored": true,
      "families": 0,
      "valuePerFamily": 6,
      "landImprovementBonus": 0,
      "landImprovementInvested": 0,
      "landImprovementProjects": [],
      "queuedImprovementGp": 0,
      "improvementBudgetGp": 0,
      "constructionSupervisorCharacterIds": [],
      "terrain": "water",
      "hasRoad": false,
      "hasTrail": false,
      "roadSides": [],
      "riverSides": [],
      "crossingSides": [],
      "elevationFt": 0,
      "groundCondition": "clear",
      "hasLake": false,
      "freshWater": false,
      "primaryStructure": "",
      "settlement": null,
      "lairs": [],
      "dungeons": [],
      "pointsOfInterest": [],
      "monsterNotes": "",
      "notes": "",
      "economyType": "agricultural",
      "terrainTransformationState": null,
      "name": "",
      "domainId": null
    },
    {
      "schemaVersion": 2,
      "id": "hex-sea-7",
      "coord": {
        "q": 7,
        "r": 4
      },
      "classification": "Borderlands",
      "explored": true,
      "families": 0,
      "valuePerFamily": 6,
      "landImprovementBonus": 0,
      "landImprovementInvested": 0,
      "landImprovementProjects": [],
      "queuedImprovementGp": 0,
      "improvementBudgetGp": 0,
      "constructionSupervisorCharacterIds": [],
      "terrain": "water",
      "hasRoad": false,
      "hasTrail": false,
      "roadSides": [],
      "riverSides": [],
      "crossingSides": [],
      "elevationFt": 0,
      "groundCondition": "clear",
      "hasLake": false,
      "freshWater": false,
      "primaryStructure": "",
      "settlement": null,
      "lairs": [],
      "dungeons": [],
      "pointsOfInterest": [],
      "monsterNotes": "",
      "notes": "",
      "economyType": "agricultural",
      "terrainTransformationState": null,
      "name": "",
      "domainId": null
    },
    {
      "schemaVersion": 2,
      "id": "hex-sea-8",
      "coord": {
        "q": 8,
        "r": 4
      },
      "classification": "Borderlands",
      "explored": true,
      "families": 0,
      "valuePerFamily": 6,
      "landImprovementBonus": 0,
      "landImprovementInvested": 0,
      "landImprovementProjects": [],
      "queuedImprovementGp": 0,
      "improvementBudgetGp": 0,
      "constructionSupervisorCharacterIds": [],
      "terrain": "water",
      "hasRoad": false,
      "hasTrail": false,
      "roadSides": [],
      "riverSides": [],
      "crossingSides": [],
      "elevationFt": 0,
      "groundCondition": "clear",
      "hasLake": false,
      "freshWater": false,
      "primaryStructure": "",
      "settlement": null,
      "lairs": [],
      "dungeons": [],
      "pointsOfInterest": [],
      "monsterNotes": "",
      "notes": "",
      "economyType": "agricultural",
      "terrainTransformationState": null,
      "name": "The Salt Sea",
      "domainId": null
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
    },
    {
      "schemaVersion": 2,
      "id": "set-tidewrack",
      "name": "Tidewrack",
      "families": 85,
      "totalInvestment": 10000,
      "foundedTurn": 1,
      "foundedByCharacterId": null,
      "demandModifiers": {},
      "placesOfPower": [],
      "rumors": [],
      "entryways": [],
      "regulatedAssets": [],
      "notes": "A salvage-port of salt-fishers, amber-gatherers, and wreck-divers on the bones of an Auran naval station. The inner harbour drowns an old warship; the Saltwidow’s shrine stands on the one Auran mole still above the tide.",
      "hexId": "hex-tidewrack-cove",
      "marketClass": "VI"
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
    },
    {
      "schemaVersion": 2,
      "id": "rum-tidewrack-1",
      "text": "The pass-road carries salt-fish and grey amber up from Tidewrack, but three of the last five caravans came back a driver short — and the Tide-Warden sends no guard past the Westfall.",
      "truthLevel": "partial",
      "apparentLevel": "uncommon",
      "topic": "trade",
      "origin": {
        "submittedAt": "2026-06-05T00:00:00.000Z",
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
          "firstHeardTurn": 4,
          "source": "manual"
        },
        {
          "settlementId": "set-saltcombe-town",
          "apparentLevel": "uncommon",
          "firstHeardTurn": 4,
          "source": "manual"
        }
      ]
    },
    {
      "schemaVersion": 2,
      "id": "rum-tidewrack-2",
      "text": "They say the Tide-Warden of Tidewrack burns the Marquis’s letters unread; her line held the cove when Saltspur was still a fishing camp, and she means to keep it free.",
      "truthLevel": "true",
      "apparentLevel": "uncommon",
      "topic": "politics",
      "origin": {
        "submittedAt": "2026-06-05T00:00:00.000Z",
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
          "firstHeardTurn": 4,
          "source": "manual"
        }
      ]
    },
    {
      "schemaVersion": 2,
      "id": "rum-tidewrack-3",
      "text": "Caravan-folk hang iron at the Deepwood’s edge and cross the Saltspur Pass at noon only — the weavers in the dark trees take the stragglers, and they are patient.",
      "truthLevel": "true",
      "apparentLevel": "uncommon",
      "topic": "monster",
      "origin": {
        "submittedAt": "2026-06-05T00:00:00.000Z",
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
          "firstHeardTurn": 4,
          "source": "manual"
        }
      ]
    },
    {
      "schemaVersion": 2,
      "id": "rum-tidewrack-4",
      "text": "That Auran warship-hull the trader spoke of? It lies in Tidewrack’s own harbour, masts under the tide — and the Saltwidow says it still keeps its cargo.",
      "truthLevel": "partial",
      "apparentLevel": "uncommon",
      "topic": "treasure",
      "origin": {
        "submittedAt": "2026-06-05T00:00:00.000Z",
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
          "firstHeardTurn": 4,
          "source": "manual"
        },
        {
          "settlementId": "set-saltcombe-town",
          "apparentLevel": "uncommon",
          "firstHeardTurn": 4,
          "source": "manual"
        }
      ]
    }
  ],
  "description": "\n\nDemo campaign for ACKS GOD MODE — a 5-month-old March of Saltspur with two vassal baronies, a registered venturer mid-caravan, brewing rumors, and one agricultural project in progress. Fork via Save As to make it your own.",
  "henchmanships": [
    {
      "schemaVersion": 2,
      "id": "hen-4mua7mp",
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
      "id": "hen-a9am71n",
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
      "id": "hen-hsz8jyr",
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
      "id": "hen-0f2t2wz",
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
      "id": "mag-uwf3sb7",
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
      "id": "mag-7h2g37a",
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
      "id": "vas-h1fakud",
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
      "id": "vas-58mjswg",
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
      "id": "prj-pg0abm0",
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
  "constructibles": [],
  "favorDutyObligations": [],
  "stashes": [
    {
      "schemaVersion": 2,
      "kind": "domain-treasury",
      "id": "stash-zb8omrq",
      "name": "March of Saltspur Treasury",
      "hexId": "hex-saltspur-keep",
      "strongholdComponentId": null,
      "ownerCharacterId": null,
      "ownerPartyId": null,
      "ownerDomainId": "dom-march-of-saltspur",
      "items": [
        {
          "id": "si-k26r94f",
          "facets": [
            "coin"
          ],
          "qty": 18000,
          "name": "",
          "denomination": "gp",
          "valuableType": null,
          "valuableTier": null,
          "unitValueGp": null,
          "encumbranceSt": null,
          "unit": null,
          "notableItemId": null,
          "containerStashId": null,
          "notes": ""
        }
      ],
      "isHidden": false,
      "notes": "",
      "createdAtTurn": 5,
      "history": [
        {
          "turn": 5,
          "type": "created",
          "reason": "treasury-migration",
          "seededFromScalarGp": 18000
        }
      ]
    },
    {
      "schemaVersion": 2,
      "kind": "domain-treasury",
      "id": "stash-4g63vys",
      "name": "Barony of Northwatch Treasury",
      "hexId": "hex-northwatch-tower",
      "strongholdComponentId": null,
      "ownerCharacterId": null,
      "ownerPartyId": null,
      "ownerDomainId": "dom-barony-northwatch",
      "items": [
        {
          "id": "si-7j9dyjs",
          "facets": [
            "coin"
          ],
          "qty": 1200,
          "name": "",
          "denomination": "gp",
          "valuableType": null,
          "valuableTier": null,
          "unitValueGp": null,
          "encumbranceSt": null,
          "unit": null,
          "notableItemId": null,
          "containerStashId": null,
          "notes": ""
        }
      ],
      "isHidden": false,
      "notes": "",
      "createdAtTurn": 5,
      "history": [
        {
          "turn": 5,
          "type": "created",
          "reason": "treasury-migration",
          "seededFromScalarGp": 1200
        }
      ]
    },
    {
      "schemaVersion": 2,
      "kind": "domain-treasury",
      "id": "stash-995bwaj",
      "name": "Barony of Saltcombe Treasury",
      "hexId": "hex-saltcombe-shrine",
      "strongholdComponentId": null,
      "ownerCharacterId": null,
      "ownerPartyId": null,
      "ownerDomainId": "dom-barony-saltcombe",
      "items": [
        {
          "id": "si-zrsjkht",
          "facets": [
            "coin"
          ],
          "qty": 1800,
          "name": "",
          "denomination": "gp",
          "valuableType": null,
          "valuableTier": null,
          "unitValueGp": null,
          "encumbranceSt": null,
          "unit": null,
          "notableItemId": null,
          "containerStashId": null,
          "notes": ""
        }
      ],
      "isHidden": false,
      "notes": "",
      "createdAtTurn": 5,
      "history": [
        {
          "turn": 5,
          "type": "created",
          "reason": "treasury-migration",
          "seededFromScalarGp": 1800
        }
      ]
    },
    {
      "schemaVersion": 2,
      "kind": "domain-treasury",
      "id": "stash-hvp1bkl",
      "name": "Free Holding of Tidewrack Treasury",
      "hexId": "hex-tidewrack-cove",
      "strongholdComponentId": null,
      "ownerCharacterId": null,
      "ownerPartyId": null,
      "ownerDomainId": "dom-tidewrack",
      "items": [
        {
          "id": "si-1uszjnk",
          "facets": [
            "coin"
          ],
          "qty": 2400,
          "name": "",
          "denomination": "gp",
          "valuableType": null,
          "valuableTier": null,
          "unitValueGp": null,
          "encumbranceSt": null,
          "unit": null,
          "notableItemId": null,
          "containerStashId": null,
          "notes": ""
        }
      ],
      "isHidden": false,
      "notes": "",
      "createdAtTurn": 5,
      "history": [
        {
          "turn": 5,
          "type": "created",
          "reason": "treasury-migration",
          "seededFromScalarGp": 2400
        }
      ]
    }
  ],
  "groups": [
    {
      "schemaVersion": 2,
      "id": "grp-greypack",
      "name": "The Grey Pack",
      "groupTemplate": {
        "monsterCatalogKey": "dire-wolf",
        "creatureTypes": [
          "animal"
        ],
        "hitDice": "4"
      },
      "count": 8,
      "casualties": 0,
      "socialTier": "independent",
      "lifecycleState": "wild",
      "currentHexId": "hex-wolfden-hills",
      "currentDomainId": null,
      "commanderCharacterId": null,
      "history": [],
      "notes": "Dire wolves the size of ponies, denned in the old cairn-hills. They take calves — and in hard winters herders — from the Northwatch pastures; Baron Yorick has lost three drives to them."
    },
    {
      "schemaVersion": 2,
      "id": "grp-merefolk",
      "name": "The Mere-Folk",
      "groupTemplate": {
        "monsterCatalogKey": "lizardman",
        "creatureTypes": [
          "humanoid"
        ],
        "hitDice": "2+1"
      },
      "count": 12,
      "casualties": 0,
      "socialTier": "independent",
      "lifecycleState": "wild",
      "currentHexId": "hex-saltmarsh",
      "currentDomainId": null,
      "commanderCharacterId": null,
      "history": [],
      "notes": "Marsh-lizardfolk who hold the drowned Auran causeway and trade only in salvaged bronze. Tidewrack leaves them a tribute of iron to keep the marsh-path open."
    },
    {
      "schemaVersion": 2,
      "id": "grp-deepweavers",
      "name": "The Deepwood Weavers",
      "groupTemplate": {
        "monsterCatalogKey": "giant-spider",
        "creatureTypes": [
          "animal"
        ],
        "hitDice": "3"
      },
      "count": 6,
      "casualties": 0,
      "socialTier": "independent",
      "lifecycleState": "wild",
      "currentHexId": "hex-deepwood",
      "currentDomainId": null,
      "commanderCharacterId": null,
      "history": [],
      "notes": "Giant spiders that web the south flank of the pass. Caravans walk the Saltspur Pass at noon and hang cold iron; the weavers take the stragglers."
    }
  ]
};
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
