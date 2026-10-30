-- Restore audited production completeness snapshots, never infer a realm
-- for arbitrary legacy aggregates. See docs/releases/2026-10-30-completeness-history.md.
BEGIN;
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '30s';
SET LOCAL TIME ZONE 'UTC';

-- The approved source IDs and whole-day payload hashes come from Bertel V3.
-- On a fresh database none exist: no production data is seeded into CI.
-- Original archives stay NULL; copies keep the exact original values and capture times.
CREATE TEMP TABLE completeness_history_20261030_manifest (
  global_id uuid PRIMARY KEY,
  snapshot_date date NOT NULL UNIQUE,
  row_count integer NOT NULL,
  quality_hash text NOT NULL
) ON COMMIT DROP;
INSERT INTO completeness_history_20261030_manifest VALUES
  ('85fabef7-4e6b-4014-b98a-30addf562063', DATE '2026-06-19', 23, '92ad5927bc66c1182fb2f5436362cea0'),
  ('127dccb6-5437-426f-a792-85fcd1b5d2de', DATE '2026-06-20', 23, '8fccec104ff7767b0ab86f8a811c4a57'),
  ('8acc2ce5-726a-4869-a486-f5960e34a1fb', DATE '2026-06-21', 23, '6c2961a1057aea25f26533c845f6d644'),
  ('e45ad6e2-e1fa-480c-9cb9-64121a6f869e', DATE '2026-06-22', 23, 'a61ff1a1f3bbfe1b6930d92b9c20b46e'),
  ('0a8320b5-488a-4f06-bb2d-8f8ac4c5e2c7', DATE '2026-06-23', 23, '68bbc4ff90fdabf803bcf2c4c04d9f31'),
  ('d2d0ea14-c37c-49fd-9d8c-ea276ccda295', DATE '2026-06-24', 23, '759c8d77a9df6c88dac63d79d8e49bf6'),
  ('4c6ad6ea-16a8-4aac-9a35-5e1e23f84d6e', DATE '2026-06-25', 23, '43e4116262128719bcbf0fa4ef148a8d'),
  ('962acd22-aecd-4fa5-b3e2-215153abe2bb', DATE '2026-06-26', 23, 'e45a68e3782d61909d83785d7bb9d65a'),
  ('846d426b-bd3a-47a1-8bf5-d7df80fd4950', DATE '2026-06-27', 23, '78bb73f0b59175dea4094b563b3d4b27'),
  ('9e894b91-4c4a-4ef5-8e33-6d6103448fa3', DATE '2026-06-28', 23, '3cbf6fbee039ecd1fb926fe7a62f37c5'),
  ('e89c48b2-981f-4fff-9167-6f57d3ada5d4', DATE '2026-06-29', 23, 'c8fe43ed963bca887244a5562d2c3e35'),
  ('16ba028f-edc5-4b8b-8006-88826a927159', DATE '2026-06-30', 23, '012c2f50d0f1c0b2df3eb54865cb54c0'),
  ('8d185a00-48ad-4b43-a55c-4f5bbe20a240', DATE '2026-07-01', 23, '68751c767fd26d1c34e2615fad59effd'),
  ('e8acd732-aaea-4da3-8a22-dfce26be76b7', DATE '2026-07-02', 23, '87ed012ffd0691bc9b0919fc24d5a44e'),
  ('c6f54df2-e649-477e-915c-339a068be0a3', DATE '2026-07-03', 23, 'daf894b2410356bb4200953c2cd9b073'),
  ('1aa5bfc4-27e2-41b8-91cf-623fc0e35d5b', DATE '2026-07-04', 23, 'ac4e10f1e96c4222b546ce2d5bb7cfad'),
  ('49ed0c4c-84c2-4362-af12-993f518464d5', DATE '2026-07-05', 23, '4087b2836649f8cda99fd8a6dc934f57'),
  ('e8fa2a0d-941c-4964-b9c0-95e68719bbbe', DATE '2026-07-06', 23, 'a5dd73fbcd3a63e39efc2401a29e8edd'),
  ('492b9608-0395-4041-b45e-521aa494a89d', DATE '2026-07-07', 23, '488037d9cfaccb681f2d4ef1fb1e18df'),
  ('845fafd0-fc6e-46a9-8f67-819cd5a0956d', DATE '2026-07-08', 23, '7be5ea6f8722597f9781dfec33ec6f8e'),
  ('7a3a636e-b671-4b88-8e1d-8e422a2829f8', DATE '2026-07-09', 23, 'd73e38fa55f4d1030af43a0864f545a8'),
  ('fa158672-9aed-4c23-ba36-e09f3254363a', DATE '2026-07-10', 23, '8a80b9b417ca991925cab05ea68212fb'),
  ('3834dbeb-ed44-4043-9f55-432457e55262', DATE '2026-07-11', 23, 'ddef9eff84cf2f93fc517b2f4c2bbb36'),
  ('3461c2b8-2820-417c-8c05-ad28546d3001', DATE '2026-07-12', 23, '588e0af4a485f69376cd2e1fae4bf62a'),
  ('d836a677-f94e-4831-8c86-ce50f91de1db', DATE '2026-07-13', 23, '47080d6877c338f8c0cf56166a312db5'),
  ('791c3bc4-cde0-4a3c-8bf7-b7caa0eefeba', DATE '2026-07-14', 23, '50ba87a3ce221b0d8528006f2f1ea43d'),
  ('104fd680-d6ef-4855-b8c3-0608f0fb5fd5', DATE '2026-07-15', 23, '16ea46bce5c98db16bd29479f10f7a9e'),
  ('eb2b3fb7-fd0d-46c1-a2ff-c6545533946f', DATE '2026-07-16', 23, '988135bbb83bfbfcd1ac80eceb8a4552'),
  ('0222e63b-3292-46df-9f9c-3506bc38d261', DATE '2026-07-17', 23, '7ba878178aac4d8f136dfbcd3f395dba'),
  ('bd8b8ba4-11d0-4529-850c-1b22b6cc779e', DATE '2026-07-18', 23, 'f5ded181556e3d4cdfc7e9dfa36780e2'),
  ('2b46074a-af39-4d6b-841b-62c6b5414728', DATE '2026-07-19', 23, 'b6ee03fa856503e2b79219db52063f23'),
  ('9650b560-ccb6-4724-a4f4-445ea228de1d', DATE '2026-07-20', 23, '2ebc5de671eeba790c2526003bcb8d39'),
  ('d33f997a-2b57-4254-8596-99b076700787', DATE '2026-07-21', 23, '0cf3ecde31f08e1e178342a32973d583'),
  ('7f698bcd-66ae-4f41-85af-53ecde31746b', DATE '2026-07-22', 23, '33d94ae3de0c9b4219cacc2b8d025e2a'),
  ('50a50daf-22fe-440a-9a56-e34edcefd1e0', DATE '2026-07-23', 23, '39cbc88fb5193deae6da9998ed3a6083'),
  ('a676020b-83fe-48e9-bec5-cd57b46ac9ca', DATE '2026-07-24', 23, '1f5a4515ef063e32992bef021fdd5c9f'),
  ('7720840b-7016-4173-856d-f619fd40fbdc', DATE '2026-07-25', 23, '24af11d11d7725600edd025ddadcbe9a'),
  ('cbfd92bd-b358-42d6-aa34-5717d836a10f', DATE '2026-07-26', 23, 'a757730e4b2e1d1fd304496ea3c559ee'),
  ('302b31ac-5566-4095-8768-8935eb9451a7', DATE '2026-07-27', 23, '77ab384a62ef26b86a63c4cace45ac29'),
  ('b826688e-90de-4720-a4df-72f68ac114c8', DATE '2026-07-28', 25, 'e6661eb7445b563827c13672c947e68d'),
  ('31cd75fa-5078-468f-8c74-04e9988966f5', DATE '2026-07-29', 25, '1331563d8ed42c0adf6d11925c1f84d9'),
  ('c2e31a67-bbc5-40ef-84c3-0492f5dc0d28', DATE '2026-07-30', 25, '605a679b821a511dc9345bce4e128066'),
  ('ff81bf1e-2b64-4cc8-a252-636b2baf1df7', DATE '2026-07-31', 25, 'fa108ee4aac9f04d8599c9741c673bc3'),
  ('36a7be5b-cd12-47c7-ae53-1c8025ac2262', DATE '2026-08-01', 25, 'e1cefa1ad2ed0a68351876e135e16d2a'),
  ('f51ba1ea-4141-4291-97f6-4e3cd7936d83', DATE '2026-08-02', 25, 'bc15b441739e664fa6fc495cafe89801'),
  ('f1fdd26e-cc2d-45e9-bdbb-c2066abb9c8a', DATE '2026-08-03', 25, '428ef0e57c2876e1cda04b212df76153'),
  ('f7b85e90-7253-4312-9626-ba81331f5fe7', DATE '2026-08-04', 25, 'dc7a7350842b2c75291c7fa4223d201f'),
  ('0c4622a8-68fd-4ecd-a027-bf7972ff7594', DATE '2026-08-05', 25, '962665be175ca26e980642cc7212850b'),
  ('08190404-2b89-4715-a561-b2578df671a6', DATE '2026-08-06', 25, 'a97f6234fa38f60f83a0f0b3ef44f7d1'),
  ('54662a34-3c2b-4ee1-acc7-a5e7e00803f0', DATE '2026-08-07', 25, 'cfa62e9e7fcc352a29ddd53f428ebbb0'),
  ('0ff33d81-5830-4070-bdba-3b3ed2ca3f19', DATE '2026-08-08', 25, '9d9ec1638d8e72d98831c553d86aeb29'),
  ('d435f314-c95c-457e-ada5-9ac4f47c63f4', DATE '2026-08-09', 25, 'f242f4b317be810393c098b85f7a80bc'),
  ('747b2a7b-53aa-430b-a63f-e5ea0baab09c', DATE '2026-08-10', 25, 'f6dc319142bceb78d7fa781b405c4650'),
  ('4a0c6cfd-25d3-4deb-ba26-dbfe62bbfe53', DATE '2026-08-11', 25, '3218a6766af2140426eef417a384b77a'),
  ('ef33b212-a65f-4a6f-ba00-7b0160976818', DATE '2026-08-12', 25, 'e082f9053a29f3270a7e1ae0fc6ae73c'),
  ('c53b7e7f-77b9-4884-b259-e8ceb2af0862', DATE '2026-08-13', 25, 'ff2e0dd2b5945938dae599e82c29a65b'),
  ('bfbbfee2-89c1-4472-bb43-db081dacf918', DATE '2026-08-14', 25, '7526e05bcf58af5041a57b0155796460'),
  ('c0929db1-a480-45ef-96bd-9527d3b68205', DATE '2026-08-15', 25, '20bb6b9afe103f928860c46fff51bb0e'),
  ('cf88924f-c7b9-455d-a013-f35c4e910dfb', DATE '2026-08-16', 25, 'd40606a870be77ba7616858df8157fef'),
  ('3f6322a1-018d-4ced-88c3-1da7a9ed2f7c', DATE '2026-08-17', 25, '6b2a535d4d908c12c8f7b377bc648a07'),
  ('11a69938-f96d-4601-b370-52f4d3103e60', DATE '2026-08-18', 25, '8bc6c3d2e76e1a4e0fa746682ae5858e'),
  ('3afb0844-73ad-4230-8127-21a613931150', DATE '2026-08-19', 25, '11f28678e0507032c1f74cef32d1f59a'),
  ('2ffb8318-0f6b-4bb4-85bd-0ef976eebf34', DATE '2026-08-20', 25, '034616ad8d7d9b9183ee2876422fe0d4'),
  ('1e26f5f4-7c00-4e1c-8114-355f091ac2a2', DATE '2026-08-21', 25, 'f247b4742e0b9f74afbd62ad6c545de3'),
  ('86061d91-78a7-41cc-8f03-06f571cda4b1', DATE '2026-08-22', 25, 'e559774ab6ffa073ce845590065f8b6e'),
  ('101e3801-cc70-496b-a32b-b99e277f29e3', DATE '2026-08-23', 25, 'dab74a99adc82c8a3754f1ee331b369c'),
  ('4e6ac45c-f7e3-426f-a004-c9b55431f784', DATE '2026-08-24', 25, '6a4d0d0e7e7a2fe7ad0358a333812526'),
  ('8c04b378-3192-4a60-8c52-85f6361af9d8', DATE '2026-08-25', 25, '0eab6b55aaf5eb727e237031167857b2'),
  ('6053dede-b79d-4c5a-bf60-f364185a1717', DATE '2026-08-26', 25, 'df7051130f0e6a75eb6b95787460392d'),
  ('2d0a5e28-d2e8-4fcc-b0f6-ec5ee511f03a', DATE '2026-08-27', 25, '40bf8fe40d1f2e3a3e72f68f7a293190'),
  ('8261ab24-d825-4769-bd2c-b73d6d5256ea', DATE '2026-08-28', 25, '2303373fc67f4c0bc7774b89c7031f5e'),
  ('f7697c5f-a4d7-46c7-894b-9cb4ee3501d0', DATE '2026-08-29', 25, 'fda2f78627be45a15e1e2fc3c4e450b7'),
  ('17bb2d75-0617-45f0-9ea6-09a0581c38ad', DATE '2026-08-30', 25, 'ebe5730abae1be3ab3e02c84af6393be'),
  ('574be064-2292-4c22-a3d9-4993fc8f5b08', DATE '2026-08-31', 25, 'e383bbd95f0d0adbb5594dccd9f54180'),
  ('4494f5b7-a638-4c9c-a7b5-df0332a66765', DATE '2026-09-01', 25, '9950c0a16b65bdf848011bfd107b8dfd'),
  ('611084e6-ff65-4cd2-9425-47cfb4114e3d', DATE '2026-09-02', 25, '0d461b28b9f4834e0c320e643c907701'),
  ('d3b9c47c-17af-452f-b6d2-997ef67b8725', DATE '2026-09-03', 25, '1ef9cca64e5e03c91f414f0da776cbce'),
  ('35cb34f1-ab19-4d3a-b6d5-da4398965ef2', DATE '2026-09-04', 25, 'a114674692697c4149f6d456b4a652db'),
  ('e94da1e2-ddd1-4cc9-b674-7e2fdcb8b763', DATE '2026-09-05', 25, '00668cff6d5e8acd80aa0357d1a7c0cb'),
  ('892be408-4ea3-48a3-9f36-159c67aae871', DATE '2026-09-06', 25, '85d631597a2c1b1b6461bac5a1b0e446'),
  ('15bd729a-2069-4d5c-819d-55fb0eb895cd', DATE '2026-09-07', 25, '6469c9dddaa2fb72bb9f7342383d0d3c'),
  ('73eb2602-cfad-4619-b815-4f6adfaa4f65', DATE '2026-09-08', 25, '0c8b6b6bbe449982da3a0b237de1e70c'),
  ('1c587f6d-8827-44cf-903e-1acaececf132', DATE '2026-09-10', 25, '440b66f382309b409bd2cab0f4bbe346'),
  ('f8b2e710-43f5-48dc-bf3a-94d098f5d120', DATE '2026-09-11', 25, '30472590d011d895bc2905238577243f'),
  ('e7795dc0-37ad-4b31-b6e8-593be30cb15f', DATE '2026-09-12', 25, 'c2b4c5931c13a83ea8eee39500a26970'),
  ('d8f06047-e993-4a58-bde0-607d429f7530', DATE '2026-09-13', 25, '43b635a626720c13610ba7aae008510e'),
  ('ede42136-96b5-4a50-85a9-fa3ae1f984c3', DATE '2026-09-14', 25, 'f00420e0ef7440e293e45f94cbc0b813'),
  ('897e1610-76d3-4a66-b962-290b0076ad1a', DATE '2026-09-15', 25, 'a84e3b4b4410386548b03a7dd5709534'),
  ('c907b9b4-a2f9-4ea1-b884-79752e926837', DATE '2026-09-16', 25, '317e4e1afa2bcc4197e5087202729c1c'),
  ('9a827ea9-ad86-46fc-b57b-ed24c925ba01', DATE '2026-09-17', 25, '1fd7da175e02e341f5fcbd5e2fdc7bfb'),
  ('bc3d0f58-66c5-48aa-b825-eae30fb64f69', DATE '2026-09-18', 25, '5cc0202601d3f9f375e2a677eb1be14d'),
  ('9df69c9f-5568-40a2-b62a-e54f920f718b', DATE '2026-09-19', 25, '86076aad88d06981ce0f0189843ba151'),
  ('53305ed8-1968-4b92-a102-6ca6bb39b0f5', DATE '2026-09-20', 25, '987bb441d103aff7180906f0fb6e8aec'),
  ('11549235-6be0-4c23-9b55-4000ed10b6ba', DATE '2026-09-21', 25, '52f21eaf368d0c473252a29a29288843'),
  ('4d56b150-2e5a-4bfa-888a-a20e06db6ef9', DATE '2026-09-22', 25, 'b305b64b58b73c96ebbd52540ef41010'),
  ('4c4922b4-9fa9-4c24-ae1e-9c463e6848a8', DATE '2026-09-23', 25, 'd17ac451a69877d5293deb4ea8ae17f4'),
  ('4914ae42-4bca-468c-a2f7-e2c45ab718d8', DATE '2026-09-24', 25, 'ab57a77b597970587816e18c77ed0854'),
  ('776359ee-7c5a-4c89-82f1-95e61e351242', DATE '2026-09-25', 25, '33d22c27c5ebe40bb9dced8780b6c4b3'),
  ('f6a36b64-a767-4716-b0cd-a19683249e66', DATE '2026-09-26', 25, '2188eb4791f1078b0c5eee6dcaede7b9'),
  ('c6907d9d-f607-4bfd-bbe3-8519d287dd64', DATE '2026-09-27', 25, '45e88d3be69844f4c6b0fcc9ac344d9b'),
  ('f1b72738-ce77-498c-8d4a-7b5ec5758953', DATE '2026-09-28', 25, '928840e19114cab64582c3d8bf741478'),
  ('70446d8c-d154-4a7b-b08d-9ed54fc1e1dd', DATE '2026-09-29', 25, 'ce7192c8059f3c13e19a60ae4571845f'),
  ('0b33ff10-5735-4d2b-bb45-dec6558102fb', DATE '2026-09-30', 25, '78f900d4531649c922b4f999fd6e9089'),
  ('fe6a020d-a20b-4805-b48b-5b70194268c9', DATE '2026-10-01', 25, '7c49e8ff1ca798ccbe6e512237db2f0e'),
  ('0d0ad8bb-a653-46f8-9ca9-a3111f8bbaf2', DATE '2026-10-02', 25, 'e035c7f89940e1d6387975ffa7830653'),
  ('2247d35d-e15e-4f3a-acdb-60e5fcd4fc8b', DATE '2026-10-03', 25, '55f513634c6664a731c22978e55b6f74'),
  ('01e16175-ab6b-4a54-be62-83e9dc64fac8', DATE '2026-10-04', 25, '110412d4c55455836be7fd9a783b8109'),
  ('ed09ec3d-fc45-4f81-b10a-a08600da837c', DATE '2026-10-05', 25, '2d62224c46380d567e3079b663a08880'),
  ('15511c47-eeab-4004-9b2e-41b82366a5ae', DATE '2026-10-06', 25, '7b76f5ea79c25b873cad649ec7c5ebaf'),
  ('5fa9001a-d4a0-4a71-b649-85a508716d81', DATE '2026-10-07', 25, '1283e5fe37a44c4008bf433b29d077f1'),
  ('749fc7ca-56f2-4861-9fcb-c6640111ef2d', DATE '2026-10-08', 25, '558b9669b18dcbe6297005d18aa08b5d'),
  ('7eef5cac-d2ed-4aad-8cc7-92adf85ba70f', DATE '2026-10-09', 25, '5b19a38b1147adf62534a77fcd344144'),
  ('31462db8-5e2d-466c-83ab-0d23345a09af', DATE '2026-10-10', 25, 'd7cc13a7c42c77301678ff1aa31aa5d6'),
  ('e39fc9b5-eb40-4836-b490-4485e8d3acc4', DATE '2026-10-11', 25, 'bfb276f0ea2a14a0699c79f13af8a602'),
  ('8d711876-db79-4049-9351-77640cef842a', DATE '2026-10-12', 25, '7afb0e23ab2780c937896578f4b5281d'),
  ('90a2d3b2-cb8c-4d32-9b3b-2a2d8d1ed7d4', DATE '2026-10-13', 25, 'fb067110f8a40fd88d68836dea44917b'),
  ('9ac9d173-1d26-4218-89d6-40e4174b5672', DATE '2026-10-14', 25, '1dbc06d256649da81833dbb5203ea477'),
  ('777686c4-b0f5-48a1-9d11-44c99919d1c4', DATE '2026-10-15', 25, '97d80c94accda8962505ba4380a17842'),
  ('99a37dfe-3f77-4904-861b-f4935b4a36be', DATE '2026-10-16', 25, '1ae46be998c444fb3760cad77624a7db'),
  ('ffb8181e-a0e0-41c6-88b7-941f2c72fa6b', DATE '2026-10-17', 25, 'f1eef86804eca6bff151247c77f62165'),
  ('fd0ac233-4b04-49e8-ac02-68252f528af3', DATE '2026-10-18', 25, '8d710136080c50039cd2ee98e53ef61c'),
  ('1b4fb5dd-037c-4855-9b9b-18b557440f43', DATE '2026-10-19', 25, '01bf2a2653125e69358ba68aabdcf5d1'),
  ('7bf3f67b-a3fb-4ae1-8713-151bfe8f8feb', DATE '2026-10-20', 25, '5d2679e077de17db50f682213e124790'),
  ('b67ce27e-4a2e-4d76-a8d5-2c900582a359', DATE '2026-10-21', 25, '2bee3a3c1342e135cc723f4202de729a'),
  ('fb2811bc-7a00-44a2-b2dc-480b02eb0e06', DATE '2026-10-22', 25, '5c467b1793c018e6e4066fb1e62b87b5'),
  ('12242abb-cfec-43d4-9da7-03f400c54661', DATE '2026-10-23', 25, '8c05ff550d55e0ca9fe602d44b1a5020'),
  ('4881ab05-d40b-4ed5-830c-d8a9a12dd7b7', DATE '2026-10-24', 25, '18465b53d38381c4e4d25af37128b20f'),
  ('0dd44ddd-b811-4747-aca7-f64fbde06ad2', DATE '2026-10-25', 25, 'd25dde51a4021752298a36eff91f7ea0'),
  ('1c8aa4c8-3755-40a8-a1bc-5a963b3f2325', DATE '2026-10-26', 25, '50a829ef5ac994a267875ac5b1843170'),
  ('a5d73549-ac7c-4e2c-9524-c8bfc0315208', DATE '2026-10-27', 25, '88b65a3e5b904c70b7a4a0e4477457bc'),
  ('6813db52-a9c3-4e45-ab81-0f25ecd6fda9', DATE '2026-10-28', 25, '389f4416c0d047f41f2118aa63159840'),
  ('e9f31abe-0d22-49c3-952e-fa0bb8aeeb09', DATE '2026-10-29', 27, '7ed78dad0f6d18187422ced760da3d6a');

-- Fail before copying if a known audited archive has changed since review.
-- Validate its independent published-corpus observation from the same capture.
DO $guard$
BEGIN
  IF EXISTS (
    SELECT 1 FROM completeness_history_20261030_manifest m
    JOIN public.metric_snapshot g ON g.id = m.global_id
    LEFT JOIN LATERAL (
      SELECT count(*) AS n, md5(string_agg((to_jsonb(q)-'is_test')::text, '|' ORDER BY q.id)) AS hash
      FROM public.metric_snapshot q
      WHERE q.snapshot_date = m.snapshot_date AND q.is_test IS NULL
        AND q.metric_key IN ('completeness_avg','completeness_complete_pct')
    ) quality ON true
    WHERE g.snapshot_date <> m.snapshot_date OR g.is_test IS NOT NULL
      OR g.metric_key <> 'completeness_avg' OR g.scope <> 'global' OR g.scope_key <> ''
      OR quality.n <> m.row_count OR quality.hash IS DISTINCT FROM m.quality_hash
      OR NOT EXISTS (
        SELECT 1 FROM public.metric_snapshot p
        WHERE p.snapshot_date = g.snapshot_date AND p.is_test IS NULL
          AND p.metric_key = 'corpus_count' AND p.scope = 'status' AND p.scope_key = 'published'
          AND p.value = g.denominator AND p.captured_at = g.captured_at
      )
  ) THEN
    RAISE EXCEPTION 'Audited completeness history changed; no historical data restored';
  END IF;
END $guard$;

WITH eligible_dates AS (
  SELECT m.snapshot_date FROM completeness_history_20261030_manifest m
  JOIN public.metric_snapshot g ON g.id = m.global_id AND g.is_test IS NULL
  WHERE NOT EXISTS (
    SELECT 1 FROM public.metric_snapshot scoped
    WHERE scoped.snapshot_date = m.snapshot_date AND scoped.is_test = false
      AND scoped.metric_key IN ('completeness_avg','completeness_complete_pct')
  )
)
INSERT INTO public.metric_snapshot(snapshot_date,scope,scope_key,metric_key,value,denominator,captured_at,is_test)
SELECT source.snapshot_date,source.scope,source.scope_key,source.metric_key,
       source.value,source.denominator,source.captured_at,false
FROM public.metric_snapshot source JOIN eligible_dates e USING (snapshot_date)
WHERE source.is_test IS NULL AND source.metric_key IN ('completeness_avg','completeness_complete_pct')
ON CONFLICT (snapshot_date,scope,scope_key,metric_key,is_test) DO NOTHING;

-- Add a reader with source dates; keep the existing tabular RPC and its return
-- type unchanged for all current clients. INVOKER retains metric_snapshot RLS.
CREATE OR REPLACE FUNCTION api.get_metric_snapshot_series_with_bounds(
  p_metric_key text,
  p_scope text DEFAULT 'global',
  p_scope_key text DEFAULT '',
  p_from date DEFAULT NULL,
  p_to date DEFAULT NULL,
  p_grain text DEFAULT 'month'
)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER
SET search_path = pg_catalog, public, api, pg_temp
AS $fn$
  SELECT jsonb_build_object(
    'points', COALESCE((
      SELECT jsonb_agg(to_jsonb(point) ORDER BY point.bucket)
      FROM api.get_metric_snapshot_series(p_metric_key,p_scope,p_scope_key,p_from,p_to,p_grain) point
    ), '[]'::jsonb),
    'first_snapshot_date', min(snapshot_date),
    'last_snapshot_date', max(snapshot_date)
  )
  FROM public.metric_snapshot
  WHERE is_test = (SELECT api.current_user_test_realm())
    AND metric_key = p_metric_key AND scope = p_scope AND scope_key = p_scope_key
    AND (p_from IS NULL OR snapshot_date >= p_from)
    AND (p_to IS NULL OR snapshot_date <= p_to);
$fn$;
REVOKE ALL ON FUNCTION api.get_metric_snapshot_series_with_bounds(text,text,text,date,date,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION api.get_metric_snapshot_series_with_bounds(text,text,text,date,date,text) TO authenticated, service_role;
COMMENT ON FUNCTION api.get_metric_snapshot_series_with_bounds(text,text,text,date,date,text) IS
  'Realm-scoped metric series plus exact first/last source snapshot dates. Weekly buckets never define history duration; legacy tabular reader stays compatible.';

NOTIFY pgrst, 'reload schema';
COMMIT;
