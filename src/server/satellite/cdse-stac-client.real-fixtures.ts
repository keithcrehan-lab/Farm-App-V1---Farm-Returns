/**
 * REAL CDSE STAC SENTINEL-2 L2A RESPONSE(S) — LIVE-FETCHED BY THIS
 * RUNTIME, 2026-09-01.
 *
 * GET https://catalogue.dataspace.copernicus.eu/stac/collections/sentinel-2-l2a/items
 *   ?bbox=-8.5,52.0,-8.0,52.5&datetime=2026-06-01T00:00:00Z/2026-06-30T23:59:59Z&limit=5
 * (a bounding box over Co. Clare/Co. Limerick, Ireland — this app's own
 * mock-farm region), HTTP 200, unauthenticated. First three features are
 * that real response's own real, unaltered results (3 real, cloudy
 * scenes, 55-83% cloud cover — genuine Irish summer weather). The fourth
 * feature is from a separate real request widening the date range to
 * find a real low-cloud-cover scene for this fixture to also exercise
 * "picks the least-cloudy real scene" behaviour meaningfully:
 * GET .../items?bbox=-8.5,52.0,-8.0,52.5&datetime=2026-04-01T00:00:00Z/2026-08-31T23:59:59Z&limit=100,
 * sorted by real eo:cloud_cover, this fixture keeps the single lowest
 * (0.08% — a genuinely near-cloud-free real scene, 2026-07-13).
 *
 * Trimmed for fixture size, not altered: each real feature's own
 * `links`/`assets` blocks are dropped entirely (this app's STAC client,
 * `cdse-stac-client.ts`, never reads either — asset access requires
 * `oidc`/`s3` credentials this build session does not have) — every
 * `id`/`bbox`/`geometry`/`properties` value below is exactly what CDSE's
 * real API returned, unedited.
 */

export const CDSE_STAC_LIVE_REAL_RESPONSE = {
  "type": "FeatureCollection",
  "features": [
    {
      "id": "S2A_MSIL2A_20260628T115421_N0512_R023_T29UNU_20260628T194416",
      "bbox": [
        -9.000299748224293,
        52.25771457807806,
        -7.751710989930772,
        53.24962646775486
      ],
      "type": "Feature",
      "geometry": {
        "type": "Polygon",
        "coordinates": [
          [
            [
              -7.751710989930771,
              53.241012955839075
            ],
            [
              -9.000299748224293,
              53.24962646775485
            ],
            [
              -9.000293048004567,
              52.26254617895429
            ],
            [
              -8.290801522583044,
              52.25771457807805
            ],
            [
              -7.751710989930771,
              53.241012955839075
            ]
          ]
        ]
      },
      "collection": "sentinel-2-l2a",
      "properties": {
        "gsd": 10,
        "created": "2026-06-28T20:35:30.000000Z",
        "expires": "2262-01-01T00:00:00.000000Z",
        "updated": "2026-06-28T20:39:38.813921Z",
        "_private": {
          "visible": true,
          "product_name": "S2A_MSIL2A_20260628T115421_N0512_R023_T29UNU_20260628T194416.SAFE",
          "product_size": 610077830,
          "product_uuid": "ce26496b-3c7e-489f-9978-3738921a6769"
        },
        "datetime": "2026-06-28T11:54:21.024000Z",
        "platform": "sentinel-2a",
        "grid:code": "MGRS-29UNU",
        "published": "2026-06-28T20:39:38.813921Z",
        "statistics": {
          "water": 0.216101,
          "nodata": 39.941314,
          "dark_area": 0.000873,
          "vegetation": 13.764887,
          "thin_cirrus": 3.813019,
          "cloud_shadow": 0.830295,
          "unclassified": 1.150696,
          "not_vegetated": 0.630762,
          "high_proba_clouds": 63.934374,
          "medium_proba_clouds": 15.658996,
          "saturated_defective": 0.0
        },
        "instruments": [
          "msi"
        ],
        "auth:schemes": {
          "s3": {
            "type": "s3"
          },
          "oidc": {
            "type": "openIdConnect",
            "openIdConnectUrl": "https://identity.dataspace.copernicus.eu/auth/realms/CDSE/.well-known/openid-configuration"
          }
        },
        "end_datetime": "2026-06-28T11:54:21.024000Z",
        "product:type": "S2MSI2A",
        "view:azimuth": 289.8873106514776,
        "constellation": "sentinel-2",
        "eo:snow_cover": 0.0,
        "eo:cloud_cover": 83.41,
        "start_datetime": "2026-06-28T11:54:21.024000Z",
        "sat:orbit_state": "descending",
        "storage:schemes": {
          "cdse-s3": {
            "type": "custom-s3",
            "class": "hot",
            "title": "Copernicus Data Space Ecosystem S3",
            "platform": "https://eodata.dataspace.copernicus.eu",
            "description": "This endpoint provides access to EO data which is stored on the object storage of both CloudFerro Cloud and OpenTelekom Cloud (OTC). See the [documentation](https://documentation.dataspace.copernicus.eu/APIs/S3.html) for more information, including how to get credentials.",
            "requester_pays": false
          },
          "creodias-s3": {
            "type": "custom-s3",
            "class": "hot",
            "title": "CREODIAS S3",
            "platform": "https://eodata.cloudferro.com",
            "description": "Comprehensive Earth Observation Data (EODATA) archive offered by CREODIAS as a commercial part of CDSE, designed to provide users with access to a vast repository of satellite data without predefined quota limits.",
            "requester_pays": true
          }
        },
        "eopf:datatake_id": "GS2A_20260628T115421_057535_N05.12",
        "processing:level": "L2",
        "view:sun_azimuth": 162.088491472509,
        "eopf:datastrip_id": "S2A_OPER_MSI_L2A_DS_2APS_20260628T194416_S20260628T115416_N05.12",
        "processing:version": "05.12",
        "product:timeliness": "PT24H",
        "sat:absolute_orbit": 57535,
        "sat:relative_orbit": 23,
        "view:sun_elevation": 59.5841113141925,
        "processing:datetime": "2026-06-28T19:44:16.000000Z",
        "processing:facility": "ESA",
        "processing:software": {
          "eometadatatool": "0"
        },
        "eopf:instrument_mode": "INS-NOBS",
        "eopf:origin_datetime": "2026-06-28T20:35:30.000000Z",
        "view:incidence_angle": 9.229051268779372,
        "product:timeliness_category": "NRT",
        "sat:platform_international_designator": "2015-028A"
      }
    },
    {
      "id": "S2A_MSIL2A_20260628T115421_N0512_R023_T29UNT_20260628T194416",
      "bbox": [
        -9.00029362911865,
        51.361622453102726,
        -8.244295908971237,
        52.3504731573947
      ],
      "type": "Feature",
      "geometry": {
        "type": "Polygon",
        "coordinates": [
          [
            [
              -8.244295908971237,
              52.34531881902493
            ],
            [
              -9.00029362911865,
              52.350473157394696
            ],
            [
              -9.000287272590182,
              51.36324170782969
            ],
            [
              -8.75959203331358,
              51.36162245310273
            ],
            [
              -8.244295908971237,
              52.34531881902493
            ]
          ]
        ]
      },
      "collection": "sentinel-2-l2a",
      "properties": {
        "gsd": 10,
        "created": "2026-06-28T20:35:08.000000Z",
        "expires": "2262-01-01T00:00:00.000000Z",
        "updated": "2026-06-28T20:38:12.516017Z",
        "_private": {
          "visible": true,
          "product_name": "S2A_MSIL2A_20260628T115421_N0512_R023_T29UNT_20260628T194416.SAFE",
          "product_size": 358305406,
          "product_uuid": "33d0bbfc-6a69-4d03-9933-8be87a8c5ce9"
        },
        "datetime": "2026-06-28T11:54:21.024000Z",
        "platform": "sentinel-2a",
        "grid:code": "MGRS-29UNT",
        "published": "2026-06-28T20:38:12.516017Z",
        "statistics": {
          "water": 7.455146,
          "nodata": 68.841988,
          "dark_area": 0.009743,
          "vegetation": 26.543668,
          "thin_cirrus": 5.285699,
          "cloud_shadow": 7.354401,
          "unclassified": 1.735406,
          "not_vegetated": 1.247059,
          "high_proba_clouds": 31.886452,
          "medium_proba_clouds": 18.479964,
          "saturated_defective": 0.0
        },
        "instruments": [
          "msi"
        ],
        "auth:schemes": {
          "s3": {
            "type": "s3"
          },
          "oidc": {
            "type": "openIdConnect",
            "openIdConnectUrl": "https://identity.dataspace.copernicus.eu/auth/realms/CDSE/.well-known/openid-configuration"
          }
        },
        "end_datetime": "2026-06-28T11:54:21.024000Z",
        "product:type": "S2MSI2A",
        "view:azimuth": 291.0777358815763,
        "constellation": "sentinel-2",
        "eo:snow_cover": 0.00246,
        "eo:cloud_cover": 55.65,
        "start_datetime": "2026-06-28T11:54:21.024000Z",
        "sat:orbit_state": "descending",
        "storage:schemes": {
          "cdse-s3": {
            "type": "custom-s3",
            "class": "hot",
            "title": "Copernicus Data Space Ecosystem S3",
            "platform": "https://eodata.dataspace.copernicus.eu",
            "description": "This endpoint provides access to EO data which is stored on the object storage of both CloudFerro Cloud and OpenTelekom Cloud (OTC). See the [documentation](https://documentation.dataspace.copernicus.eu/APIs/S3.html) for more information, including how to get credentials.",
            "requester_pays": false
          },
          "creodias-s3": {
            "type": "custom-s3",
            "class": "hot",
            "title": "CREODIAS S3",
            "platform": "https://eodata.cloudferro.com",
            "description": "Comprehensive Earth Observation Data (EODATA) archive offered by CREODIAS as a commercial part of CDSE, designed to provide users with access to a vast repository of satellite data without predefined quota limits.",
            "requester_pays": true
          }
        },
        "eopf:datatake_id": "GS2A_20260628T115421_057535_N05.12",
        "processing:level": "L2",
        "view:sun_azimuth": 161.682404169905,
        "eopf:datastrip_id": "S2A_OPER_MSI_L2A_DS_2APS_20260628T194416_S20260628T115416_N05.12",
        "processing:version": "05.12",
        "product:timeliness": "PT24H",
        "sat:absolute_orbit": 57535,
        "sat:relative_orbit": 23,
        "view:sun_elevation": 60.4469695825765,
        "processing:datetime": "2026-06-28T19:44:16.000000Z",
        "processing:facility": "ESA",
        "processing:software": {
          "eometadatatool": "0"
        },
        "eopf:instrument_mode": "INS-NOBS",
        "eopf:origin_datetime": "2026-06-28T20:35:08.000000Z",
        "view:incidence_angle": 10.384225940455355,
        "product:timeliness_category": "NRT",
        "sat:platform_international_designator": "2015-028A"
      }
    },
    {
      "id": "S2B_MSIL2A_20260628T114349_N0512_R123_T29UNU_20260628T152530",
      "bbox": [
        -9.000299748224293,
        52.25159244435569,
        -7.355053335355696,
        53.24962646775486
      ],
      "type": "Feature",
      "geometry": {
        "type": "Polygon",
        "coordinates": [
          [
            [
              -9.000299748224293,
              53.24962646775486
            ],
            [
              -9.000293048004565,
              52.26254617895429
            ],
            [
              -7.391803011573102,
              52.25159244435569
            ],
            [
              -7.355053335355696,
              53.238276574134964
            ],
            [
              -9.000299748224293,
              53.24962646775486
            ]
          ]
        ]
      },
      "collection": "sentinel-2-l2a",
      "properties": {
        "gsd": 10,
        "created": "2026-06-28T15:57:31.000000Z",
        "expires": "2262-01-01T00:00:00.000000Z",
        "updated": "2026-06-28T16:01:37.919773Z",
        "_private": {
          "visible": true,
          "product_name": "S2B_MSIL2A_20260628T114349_N0512_R123_T29UNU_20260628T152530.SAFE",
          "product_size": 1063224879,
          "product_uuid": "aeba32b4-1e18-45d3-989a-1c530c0e8cce"
        },
        "datetime": "2026-06-28T11:43:49.024000Z",
        "platform": "sentinel-2b",
        "grid:code": "MGRS-29UNU",
        "published": "2026-06-28T16:01:37.919773Z",
        "statistics": {
          "water": 0.174561,
          "nodata": 0.0,
          "dark_area": 0.000634,
          "vegetation": 22.528711,
          "thin_cirrus": 6.441492,
          "cloud_shadow": 5.016427,
          "unclassified": 0.981858,
          "not_vegetated": 1.167163,
          "high_proba_clouds": 47.813517,
          "medium_proba_clouds": 15.875638,
          "saturated_defective": 0.0
        },
        "instruments": [
          "msi"
        ],
        "auth:schemes": {
          "s3": {
            "type": "s3"
          },
          "oidc": {
            "type": "openIdConnect",
            "openIdConnectUrl": "https://identity.dataspace.copernicus.eu/auth/realms/CDSE/.well-known/openid-configuration"
          }
        },
        "end_datetime": "2026-06-28T11:43:49.024000Z",
        "product:type": "S2MSI2A",
        "view:azimuth": 138.30050550043325,
        "constellation": "sentinel-2",
        "eo:snow_cover": 0.0,
        "eo:cloud_cover": 70.13,
        "start_datetime": "2026-06-28T11:43:49.024000Z",
        "sat:orbit_state": "descending",
        "storage:schemes": {
          "cdse-s3": {
            "type": "custom-s3",
            "class": "hot",
            "title": "Copernicus Data Space Ecosystem S3",
            "platform": "https://eodata.dataspace.copernicus.eu",
            "description": "This endpoint provides access to EO data which is stored on the object storage of both CloudFerro Cloud and OpenTelekom Cloud (OTC). See the [documentation](https://documentation.dataspace.copernicus.eu/APIs/S3.html) for more information, including how to get credentials.",
            "requester_pays": false
          },
          "creodias-s3": {
            "type": "custom-s3",
            "class": "hot",
            "title": "CREODIAS S3",
            "platform": "https://eodata.cloudferro.com",
            "description": "Comprehensive Earth Observation Data (EODATA) archive offered by CREODIAS as a commercial part of CDSE, designed to provide users with access to a vast repository of satellite data without predefined quota limits.",
            "requester_pays": true
          }
        },
        "eopf:datatake_id": "GS2B_20260628T114349_048626_N05.12",
        "processing:level": "L2",
        "view:sun_azimuth": 157.583680378863,
        "eopf:datastrip_id": "S2B_OPER_MSI_L2A_DS_2BPS_20260628T152530_S20260628T114344_N05.12",
        "processing:version": "05.12",
        "product:timeliness": "PT24H",
        "sat:absolute_orbit": 48626,
        "sat:relative_orbit": 123,
        "view:sun_elevation": 59.0484407505956,
        "processing:datetime": "2026-06-28T15:25:30.000000Z",
        "processing:facility": "ESA",
        "processing:software": {
          "eometadatatool": "0"
        },
        "eopf:instrument_mode": "INS-NOBS",
        "eopf:origin_datetime": "2026-06-28T15:57:31.000000Z",
        "view:incidence_angle": 3.224282021619679,
        "product:timeliness_category": "NRT",
        "sat:platform_international_designator": "2017-013A"
      }
    },
    {
      "id": "S2C_MSIL2A_20260713T114351_N0512_R123_T29UNT_20260713T163414",
      "bbox": [
        -9.00029362911865,
        51.35263389325745,
        -7.388615637207039,
        52.3504731573947
      ],
      "type": "Feature",
      "geometry": {
        "type": "Polygon",
        "coordinates": [
          [
            [
              -9.00029362911865,
              52.3504731573947
            ],
            [
              -9.000287272590182,
              51.36324170782969
            ],
            [
              -7.423481335788423,
              51.35263389325745
            ],
            [
              -7.388615637207039,
              52.3394848521498
            ],
            [
              -9.00029362911865,
              52.3504731573947
            ]
          ]
        ]
      },
      "collection": "sentinel-2-l2a",
      "properties": {
        "gsd": 10,
        "created": "2026-07-13T17:24:27.000000Z",
        "expires": "2262-01-01T00:00:00.000000Z",
        "updated": "2026-07-13T17:29:42.386027Z",
        "_private": {
          "visible": true,
          "product_name": "S2C_MSIL2A_20260713T114351_N0512_R123_T29UNT_20260713T163414.SAFE",
          "product_size": 1089932614,
          "product_uuid": "38b53eb0-445b-49b3-8c3f-809e2338ef36"
        },
        "datetime": "2026-07-13T11:43:51.025000Z",
        "platform": "sentinel-2c",
        "grid:code": "MGRS-29UNT",
        "published": "2026-07-13T17:29:42.386027Z",
        "statistics": {
          "water": 44.883281,
          "nodata": 0.0,
          "dark_area": 0.021496,
          "vegetation": 51.670241,
          "thin_cirrus": 0.00852,
          "cloud_shadow": 0.148009,
          "unclassified": 0.050318,
          "not_vegetated": 3.14064,
          "high_proba_clouds": 0.013494,
          "medium_proba_clouds": 0.061675,
          "saturated_defective": 0.0
        },
        "instruments": [
          "msi"
        ],
        "auth:schemes": {
          "s3": {
            "type": "s3"
          },
          "oidc": {
            "type": "openIdConnect",
            "openIdConnectUrl": "https://identity.dataspace.copernicus.eu/auth/realms/CDSE/.well-known/openid-configuration"
          }
        },
        "end_datetime": "2026-07-13T11:43:51.025000Z",
        "product:type": "S2MSI2A",
        "view:azimuth": 184.48989330781808,
        "constellation": "sentinel-2",
        "eo:snow_cover": 0.002322,
        "eo:cloud_cover": 0.08,
        "start_datetime": "2026-07-13T11:43:51.025000Z",
        "sat:orbit_state": "descending",
        "storage:schemes": {
          "cdse-s3": {
            "type": "custom-s3",
            "class": "hot",
            "title": "Copernicus Data Space Ecosystem S3",
            "platform": "https://eodata.dataspace.copernicus.eu",
            "description": "This endpoint provides access to EO data which is stored on the object storage of both CloudFerro Cloud and OpenTelekom Cloud (OTC). See the [documentation](https://documentation.dataspace.copernicus.eu/APIs/S3.html) for more information, including how to get credentials.",
            "requester_pays": false
          },
          "creodias-s3": {
            "type": "custom-s3",
            "class": "hot",
            "title": "CREODIAS S3",
            "platform": "https://eodata.cloudferro.com",
            "description": "Comprehensive Earth Observation Data (EODATA) archive offered by CREODIAS as a commercial part of CDSE, designed to provide users with access to a vast repository of satellite data without predefined quota limits.",
            "requester_pays": true
          }
        },
        "eopf:datatake_id": "GS2C_20260713T114351_009674_N05.12",
        "processing:level": "L2",
        "view:sun_azimuth": 156.770275308039,
        "eopf:datastrip_id": "S2C_OPER_MSI_L2A_DS_2CPS_20260713T163414_S20260713T114348_N05.12",
        "processing:version": "05.12",
        "product:timeliness": "PT24H",
        "sat:absolute_orbit": 9674,
        "sat:relative_orbit": 123,
        "view:sun_elevation": 58.3100574577251,
        "processing:datetime": "2026-07-13T16:34:14.000000Z",
        "processing:facility": "ESA",
        "processing:software": {
          "eometadatatool": "0"
        },
        "eopf:instrument_mode": "INS-NOBS",
        "eopf:origin_datetime": "2026-07-13T17:24:27.000000Z",
        "view:incidence_angle": 2.765469977976949,
        "product:timeliness_category": "NRT",
        "sat:platform_international_designator": "2024-157A"
      }
    }
  ]
} as const;
