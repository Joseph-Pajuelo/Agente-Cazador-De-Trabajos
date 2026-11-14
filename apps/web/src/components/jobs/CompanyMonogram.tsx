'use client';

import React from 'react';
import { getBrand, resolveEmployer } from '@/lib/domain/companies';

interface CompanyMonogramProps {
  brandKey?: string | null;
  companyName?: string | null;
  logoUrl?: string | null;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const VIBRANT_PALETTE = [
  { bg: '#DBEAFE', text: '#1D4ED8', border: '#93C5FD' }, // Royal Blue
  { bg: '#D1FAE5', text: '#047857', border: '#6EE7B7' }, // Emerald
  { bg: '#FEF3C7', text: '#B45309', border: '#FCD34D' }, // Amber
  { bg: '#EDE9FE', text: '#6D28D9', border: '#C4B5FD' }, // Violet
  { bg: '#FFE4E6', text: '#BE123C', border: '#FDA4AF' }, // Rose
  { bg: '#CCFBF1', text: '#0F766E', border: '#5EEAD4' }, // Teal
  { bg: '#E0E7FF', text: '#4338CA', border: '#A5B4FC' }, // Indigo
];

/**
 * Official company logos extracted from Bumeran, LinkedIn, CompuTrabajo & CVMatcher.
 */
const OFFICIAL_BRAND_LOGOS: Record<string, string> = {
  scotiabank:
    'https://imgbum.jobscdn.com/portal/img/empresas/11/static/logoMainPic_13080984_bum_vd450e092.jpg',
  bbva:
    'https://media.licdn.com/dms/image/v2/D560BAQGJbdXwhVZL8A/company-logo_100_100/B56ZbzLj14HUAU-/0/1747836616734/bbva_peru_logo?e=2147483647&v=beta&t=Y6KD7Ro2OonrCj1CJf2kuXTmId908Df6gQb54op3Rz0',
  bcp:
    'https://media.licdn.com/dms/image/v2/D4E0BAQERqP4i3nph_A/company-logo_100_100/company-logo_100_100/0/1712770863639/banco_de_credito_bcp_logo?e=1796256000&v=beta&t=aLVMx86h4FW-1qYq-ULs6zTIvgJ_On-uA19DGVdqTy4',
  interbank:
    'https://kgmltevsabbsdxyzwuvn.supabase.co/storage/v1/object/public/assets/sources/interbank.webp',
  alfin:
    'https://media.licdn.com/dms/image/v2/D4E0BAQEhOD1LoTY78g/company-logo_400_400/company-logo_400_400/0/1722548193875?e=1795046400&v=beta&t=TS7UUEST665hDrQcS3okncsioxTX8uUbHyz8ObLZWvA',
  mibanco:
    'https://imgbum.jobscdn.com/portal/img/empresas/11/static/logoMainPic_10105619_bum_v5f55ce6e.jpg',
  banbif:
    'https://imgbum.jobscdn.com/portal/img/empresas/11/static/logoMainPic_1573110_bum_v7581ea3e.jpg',
  bcrp:
    'https://imgbum.jobscdn.com/portal/img/empresas/11/static/logoMainPic_13134648_bum_vc2c52a7d.jpg',
  sbs:
    'https://imgbum.jobscdn.com/portal/img/empresas/11/static/logoMainPic_10168695_bum_v86cb2db1.jpg',
  indecopi:
    'https://kgmltevsabbsdxyzwuvn.supabase.co/storage/v1/object/public/assets/business/indecopi_logo.png',
  ey:
    'https://imgbum.jobscdn.com/portal/img/empresas/11/static/logoMainPic_2497140_bum_v12fff06b.jpg',
  kpmg:
    'https://imgbum.jobscdn.com/portal/img/empresas/11/static/logoMainPic_10161211_bum_v3171c198.jpg',
  deloitte:
    'https://media.licdn.com/dms/image/v2/C560BAQGNtpblgQpJoQ/company-logo_100_100/company-logo_100_100/0/1662120928214/deloitte_logo?e=1796256000&v=beta&t=wqQ8n7eLjveTPY0NvkJISKFyAO_fhedXBBNLMLs9FOg',
  pwc:
    'https://imgbum.jobscdn.com/portal/img/empresas/11/static/logoMainPic_2498960_bum_va6ce67e8.jpg',
  bdo:
    'https://imgbum.jobscdn.com/portal/img/empresas/11/static/logoMainPic_13371495_bum_v55b893c2.jpg',
  nttdata:
    'https://imgbum.jobscdn.com/portal/img/empresas/11/static/logoMainPic_10006613_bum_vad486271.jpg',
  indra:
    'https://imgbum.jobscdn.com/portal/img/empresas/18/static/logoMainPic_2255030_bum_v95a9860f.jpg',
  inetum:
    'https://imgbum.jobscdn.com/portal/img/empresas/11/static/logoMainPic_1669060_bum_vffb33798.jpg',
  canvia:
    'https://imgbum.jobscdn.com/portal/img/empresas/11/static/logoMainPic_13122312_bum_v2a5436f4.jpg',
  tcs:
    'https://media.licdn.com/dms/image/v2/D4D0BAQGsGR9p4ikS5w/company-logo_100_100/company-logo_100_100/0/1708946550425/tata_consultancy_services_logo?e=1796256000&v=beta&t=-s3l433grn7hYu0LH3Rsv03_HMLXpO3wssHkUcn53Fo',
  siemens:
    'https://media.licdn.com/dms/image/v2/D4D0BAQFK_4wGnzwPTQ/company-logo_100_100/company-logo_100_100/0/1719931174735/siemens_logo?e=1796256000&v=beta&t=7iIZdHBm0S5KM7wT0l6-Yh5BsXruVcygyUkQ2WwJ7mc',
  falabella:
    'https://ii.ct-stc.com/3/logos/empresas/2024/03/14//falabella-corporativo-peru165827thumbnail.jpeg',
  ripley:
    'https://media.licdn.com/dms/image/v2/D4E0BAQHgwK28BEdqtQ/company-logo_100_100/company-logo_100_100/0/1719843991780/banco_ripley_logo?e=1796256000&v=beta&t=AUKAA5RQMbj08HmySEGh3l1hoX_H4i48FJ3mHNN-91Y',
  pacifico:
    'https://imgbum.jobscdn.com/portal/img/empresas/11/static/logoMainPic_1940770_aviso_1115147743_bum_vb40c9958.jpg',
  rimac:
    'https://imgbum.jobscdn.com/portal/img/empresas/11/static/logoMainPic_10119945_bum_vb5114443.jpg',
  positiva:
    'https://imgbum.jobscdn.com/portal/img/empresas/11/static/logoMainPic_1545420_bum_v4d8ae241.jpg',
  ferreyros:
    'https://imgbum.jobscdn.com/portal/img/empresas/11/static/logoMainPic_13158836_bum_v2d9f28cb.jpg',
  alicorp:
    'https://imgbum.jobscdn.com/portal/img/empresas/11/static/logoMainPic_1333690_bum_vaa78b909.jpg',
  gloria:
    'https://imgbum.jobscdn.com/portal/img/empresas/11/static/logoMainPic_937000_bum_v3846fef6.jpg',
  backus:
    'https://imgbum.jobscdn.com/portal/img/empresas/11/static/logoMainPic_10000282_bum_v7ae1f290.jpg',
  cencosud:
    'https://imgbum.jobscdn.com/portal/img/empresas/11/static/logoMainPic_10001020_bum_vaec3d713.jpg',
  promart:
    'https://imgbum.jobscdn.com/portal/img/empresas/11/static/logoMainPic_10160668_bum_vfae67bcd.jpg',
  oechsle:
    'https://imgbum.jobscdn.com/portal/img/empresas/11/static/logoMainPic_10000231_bum_v241ea17a.jpg',
  intercorp:
    'https://ii.ct-stc.com/3/logos/empresas/2024/01/04//grupo-intercorp230649thumbnail.png',
  izipay:
    'https://imgbum.jobscdn.com/portal/img/empresas/11/static/logoMainPic_10149683_bum_vacd4fc2d.jpg',
  yape:
    'https://media.licdn.com/dms/image/v2/D4D0BAQHB7FCb9tzUqw/company-logo_100_100/B4DZxyoH.aGQAQ-/0/1771449647490/yapeoficial_logo?e=1796256000&v=beta&t=WQKPaiLMV38RNpjToJq7b_tfH7VPdF3an32-viFRXEU',
  entel:
    'https://imgbum.jobscdn.com/portal/img/empresas/11/static/logoMainPic_10108917_bum_v9773eabe.jpg',
  claro:
    'https://imgbum.jobscdn.com/portal/img/empresas/11/static/logoMainPic_1775880_bum_v90e9b0d3.jpg',
  movistar:
    'https://media.licdn.com/dms/image/v2/D4E0BAQFQ1OjwQ2rVbw/company-logo_100_100/company-logo_100_100/0/1727681140503/telefonica_logo?e=2147483647&v=beta&t=7WW4bNv4-K6ebdH6Aoko-BHyxmWNqSkqhsrVxABcRy4',
  bitel:
    'https://ii.ct-stc.com/3/logos/empresas/2021/09/20//bitel171636thumbnail.jpeg',
  luzdelsur:
    'https://imgbum.jobscdn.com/portal/img/empresas/11/static/logoMainPic_10152493_bum_vf5e35bcf.jpg',
  primax:
    'https://imgbum.jobscdn.com/portal/img/empresas/0/0/1/0/2/0/9/9/5/1/logoMainPic_10209951_bum_v92ab05a5.jpg',
  repsol:
    'https://imgbum.jobscdn.com/portal/img/empresas/11/static/logoMainPic_13251616_bum_v3432f568.jpg',
  manpower:
    'https://imgbum.jobscdn.com/portal/img/empresas/11/static/logoMainPic_10011970_bum_v646cbf9.jpg',
  adecco:
    'https://ii.ct-stc.com/3/logos/empresas/2017/02/28/adecco-peru-sa-E540E05432961430162133thumbnail.png',
  overall:
    'https://ii.ct-stc.com/3/logos/empresas/2017/07/07/overall-strategy-78599D69D7ADFC84220615thumbnail.jpeg',
  utp:
    'https://imgbum.jobscdn.com/portal/img/empresas/11/static/logoMainPic_13376106_bum_v6ed00e55.jpg',
  pucp:
    'https://imgbum.jobscdn.com/portal/img/empresas/11/static/logoMainPic_1722920_bum_v2a7d6c49.jpg',
  usil:
    'https://imgbum.jobscdn.com/portal/img/empresas/11/static/logoMainPic_1011010_bum_vfb43c80b.jpg',
  upn:
    'https://imgbum.jobscdn.com/portal/img/empresas/11/static/logoMainPic_10077439_bum_v4dbf9412.jpg',
  sanna:
    'https://imgbum.jobscdn.com/portal/img/empresas/11/static/logoMainPic_1940770_bum_v10eadda2.jpg',
  abbott:
    'https://imgbum.jobscdn.com/portal/img/empresas/0/0/0/1/0/7/4/0/1/0/logoMainPic_1074010_bum_v1f4b9c30.jpg',
  auna:
    'https://media.licdn.com/dms/image/v2/D4E0BAQGoTm7iyhQKFw/company-logo_100_100/company-logo_100_100/0/1699996341720?e=2147483647&v=beta&t=PuWKCf89xexoNgJ4d4SAABazvf5f_3DhfQYe6btpiYE',
  bairesdev:
    'https://media.licdn.com/dms/image/v2/D4E0BAQGNvQASzrdL_w/company-logo_100_100/company-logo_100_100/0/1687874736484/bairesdev_logo?e=2147483647&v=beta&t=O-1i-F9arEGwUjngSlvE7NWxL-mpYFwN_XZxHy0C03s',
  coes:
    'https://imgbum.jobscdn.com/portal/img/empresas/11/static/logoMainPic_10087113_bum_vfa71b255.jpg',
  pacasmayo:
    'https://imgbum.jobscdn.com/portal/img/empresas/11/static/logoMainPic_10002125_bum_v1ecff76d.jpg',
  cajatrujillo:
    'https://imgbum.jobscdn.com/portal/img/empresas/11/static/logoMainPic_907780_bum_v1f38bc8f.jpg',
};

/**
 * Known domains for Peruvian and global employers in Lima's internship market.
 * Used as fallback when no direct portal logo or official brand logo URL is available.
 */
const COMPANY_DOMAINS: Record<string, string> = {
  bcp: 'viabcp.com',
  interbank: 'interbank.pe',
  intercorp: 'intercorp.com.pe',
  bbva: 'bbva.pe',
  scotiabank: 'scotiabank.com.pe',
  mibanco: 'mibanco.com.pe',
  banbif: 'banbif.com.pe',
  pichincha: 'pichincha.pe',
  bcrp: 'bcrp.gob.pe',
  sbs: 'sbs.gob.pe',
  sunat: 'sunat.gob.pe',
  smv: 'smv.gob.pe',
  cofide: 'cofide.com.pe',
  credicorp: 'credicorpcapital.com',
  pacifico: 'pacifico.com.pe',
  rimac: 'rimac.com',
  mapfre: 'mapfre.com.pe',
  positiva: 'lapositiva.com.pe',
  profuturo: 'profuturo.com.pe',
  integra: 'afpintegra.pe',
  prima: 'prima.com.pe',
  habitat: 'afphabitat.com.pe',
  alicorp: 'alicorp.com.pe',
  gloria: 'grupogloria.com',
  backus: 'backus.pe',
  nestle: 'nestle.com.pe',
  unilever: 'unilever.com',
  pg: 'pg.com',
  kimberly: 'kimberly-clark.com',
  ferreyros: 'ferreyros.com.pe',
  ferreycorp: 'ferreycorp.com.pe',
  komatsu: 'kmmp.com.pe',
  antamina: 'antamina.com',
  lasbambas: 'lasbambas.com',
  cerroverde: 'cerroverde.pe',
  southerncopper: 'southerncoppercorp.com',
  buenaventura: 'buenaventura.com',
  minsap: 'minsur.com',
  hochschild: 'hochschildmining.com',
  goldfields: 'goldfields.com',
  panamericansilver: 'panamericansilver.com',
  engie: 'engie-energia.pe',
  pluz: 'pluz.pe',
  enel: 'pluz.pe',
  calidda: 'calidda.com.pe',
  luzdelsur: 'luzdelsur.com.pe',
  isa: 'isarep.com.pe',
  coes: 'coes.org.pe',
  primax: 'primax.com.pe',
  repsol: 'repsol.pe',
  petroperu: 'petroperu.com.pe',
  entel: 'entel.pe',
  claro: 'claro.com.pe',
  movistar: 'movistar.com.pe',
  telefonica: 'telefonica.com.pe',
  bitel: 'bitel.com.pe',
  win: 'win.pe',
  falabella: 'falabella.com.pe',
  saga: 'falabella.com.pe',
  tottus: 'tottus.com.pe',
  sodimac: 'sodimac.com.pe',
  ripley: 'ripley.com.pe',
  cencosud: 'cencosud.com',
  supermercadosperuanos: 'plazavea.com.pe',
  plazavea: 'plazavea.com.pe',
  promart: 'promart.pe',
  oechsle: 'oechsle.pe',
  inkafarma: 'inkafarma.pe',
  mifarma: 'mifarma.com.pe',
  cineplanet: 'cineplanet.com.pe',
  delosi: 'delosi.com',
  ngr: 'ngr.com.pe',
  latam: 'latamairlines.com',
  limaairport: 'lima-airport.com',
  dpworld: 'dpworld.com',
  apmterminals: 'apmterminals.com',
  ransa: 'ransa.biz',
  dinet: 'dinet.com.pe',
  schaffen: 'schff.com',
  ey: 'ey.com',
  deloitte: 'deloitte.com',
  pwc: 'pwc.com',
  kpmg: 'kpmg.com',
  bdo: 'bdo.com.pe',
  mckinsey: 'mckinsey.com',
  bcg: 'bcg.com',
  bain: 'bain.com',
  nttdata: 'nttdata.com',
  everis: 'nttdata.com',
  indra: 'indracompany.com',
  minsait: 'minsait.com',
  globant: 'globant.com',
  bairesdev: 'bairesdev.com',
  accenture: 'accenture.com',
  ibm: 'ibm.com',
  microsoft: 'microsoft.com',
  google: 'google.com',
  aws: 'aws.amazon.com',
  oracle: 'oracle.com',
  sap: 'sap.com',
  huawei: 'huawei.com',
  cisco: 'cisco.com',
  canvia: 'canvia.com',
  tivit: 'tivit.com',
  sonda: 'sonda.com',
  stefanini: 'stefanini.com',
  inetum: 'inetum.com',
  fractal: 'fractal.com.pe',
  culqi: 'culqi.com',
  niubiz: 'niubiz.com.pe',
  izipay: 'izipay.pe',
  yape: 'yape.com.pe',
  rappi: 'rappi.com.pe',
  pedidosya: 'pedidosya.com.pe',
  cabify: 'cabify.com',
  uber: 'uber.com',
  mercadolibre: 'mercadolibre.com.pe',
  utp: 'utp.edu.pe',
  upc: 'upc.edu.pe',
  pucp: 'pucp.edu.pe',
  ulima: 'ulima.edu.pe',
  up: 'up.edu.pe',
  esan: 'esan.edu.pe',
  usil: 'usil.edu.pe',
  upn: 'upn.edu.pe',
  ucsur: 'cientifica.edu.pe',
  cibertec: 'cibertec.edu.pe',
  senati: 'senati.edu.pe',
  auna: 'auna.pe',
  sanna: 'sanna.pe',
  internacional: 'clinicainternacional.com.pe',
  ricardopalma: 'crp.com.pe',
  angloamericana: 'clinicaangloamericana.pe',
  delgado: 'clinicadelgado.pe',
  aviva: 'aviva.pe',
  manpower: 'manpowergroup.pe',
  adecco: 'adecco.com.pe',
  overall: 'overall.pe',
  michaelpage: 'michaelpage.pe',
  kornferry: 'kornferry.com',
  randstad: 'randstad.com',
  umer: 'bumeran.com.pe',
};

function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function extractInitials(name?: string | null): string {
  if (!name) return 'JH';
  const cleaned = name
    .replace(/(?:S\.?A\.?C?\.?|S\.?A\.?|E\.?I\.?R\.?L\.?|Per[uú]|Lima)/gi, '')
    .trim();
  const words = cleaned.split(/\s+/).filter(Boolean);

  if (words.length >= 2) {
    return (words[0][0] + words[1][0]).toUpperCase();
  }
  if (words.length === 1 && words[0].length >= 2) {
    return words[0].slice(0, 2).toUpperCase();
  }
  return (name[0] || 'J').toUpperCase();
}

/**
 * Resolves the company's own brand key and domain from `companyName` FIRST,
 * so agency postings (e.g. ManpowerGroup recruiting for BCP) show ManpowerGroup's
 * own logo on the avatar instead of overriding it with the client's brandKey.
 */
function detectCompanyDomain(
  brandKey?: string | null,
  companyName?: string | null
): { key: string; domain: string | null } {
  const rawName = (companyName || '').toLowerCase().trim();
  const normKey = (brandKey || '').toLowerCase().trim();

  if (rawName) {
    // 1. Direct substring match on companyName first
    const substringDomains: [RegExp, string, string][] = [
      [/\bmanpower/i, 'manpower', 'manpowergroup.pe'],
      [/\badecco\b/i, 'adecco', 'adecco.com.pe'],
      [/\boverall\b/i, 'overall', 'overall.pe'],
      [/\bmichael\s*page\b/i, 'michaelpage', 'michaelpage.pe'],
      [/\bkorn\s*ferry\b/i, 'kornferry', 'kornferry.com'],
      [/\brandstad\b/i, 'randstad', 'randstad.com'],
      [/\bscotiabank|scotia\b/i, 'scotiabank', 'scotiabank.com.pe'],
      [/\bbbva\b/i, 'bbva', 'bbva.pe'],
      [/\bbcp|banco de cr[eé]dito\b/i, 'bcp', 'viabcp.com'],
      [/\binterbank\b/i, 'interbank', 'interbank.pe'],
      [/\bintercorp\b/i, 'intercorp', 'intercorp.com.pe'],
      [/\bmibanco\b/i, 'mibanco', 'mibanco.com.pe'],
      [/\bbanbif\b/i, 'banbif', 'banbif.com.pe'],
      [/\balfin\b/i, 'alfin', 'alfinbanco.pe'],
      [/\bpac[ií]fico\b/i, 'pacifico', 'pacifico.com.pe'],
      [/\br[ií]mac\b/i, 'rimac', 'rimac.com'],
      [/\bpositiva\b/i, 'positiva', 'lapositiva.com.pe'],
      [/\balicorp\b/i, 'alicorp', 'alicorp.com.pe'],
      [/\bgloria\b/i, 'gloria', 'grupogloria.com'],
      [/\bbackus\b/i, 'backus', 'backus.pe'],
      [/\bferreyros|ferreycorp\b/i, 'ferreyros', 'ferreyros.com.pe'],
      [/\bentel\b/i, 'entel', 'entel.pe'],
      [/\bclaro|am[eé]rica m[oó]vil\b/i, 'claro', 'claro.com.pe'],
      [/\bmovistar|telef[oó]nica\b/i, 'movistar', 'movistar.com.pe'],
      [/\bbitel\b/i, 'bitel', 'bitel.com.pe'],
      [/\bluz del sur\b/i, 'luzdelsur', 'luzdelsur.com.pe'],
      [/\bfalabella|tottus|sodimac\b/i, 'falabella', 'falabella.com.pe'],
      [/\bripley\b/i, 'ripley', 'ripley.com.pe'],
      [/\bcencosud|wong|metro\b/i, 'cencosud', 'cencosud.com'],
      [/\bpromart\b/i, 'promart', 'promart.pe'],
      [/\boechsle\b/i, 'oechsle', 'oechsle.pe'],
      [/\bizipay\b/i, 'izipay', 'izipay.pe'],
      [/\byape\b/i, 'yape', 'yape.com.pe'],
      [/\bcineplanet\b/i, 'cineplanet', 'cineplanet.com.pe'],
      [/\bprimax\b/i, 'primax', 'primax.com.pe'],
      [/\brepsol\b/i, 'repsol', 'repsol.pe'],
      [/\bbcrp|banco central de reserva\b/i, 'bcrp', 'bcrp.gob.pe'],
      [/\bsbs|superintendencia de banca\b/i, 'sbs', 'sbs.gob.pe'],
      [/\bindecopi\b/i, 'indecopi', 'indecopi.gob.pe'],
      [/\bsunat\b/i, 'sunat', 'www.gob.pe'],
      [/\bsunarp\b/i, 'sunarp', 'www.gob.pe'],
      [/\bmincul|ministerio de cultura|ministerio|ugel|gobierno regional\b/i, 'gobpe', 'www.gob.pe'],
      [/\bcoes\b/i, 'coes', 'coes.org.pe'],
      [/\bpacasmayo\b/i, 'pacasmayo', 'pacasmayo.com.pe'],
      [/\bcaja\s*trujillo\b/i, 'cajatrujillo', 'cajatrujillo.com.pe'],
      [/\bpan american silver\b/i, 'panamericansilver', 'panamericansilver.com'],
      [/\bbairesdev\b/i, 'bairesdev', 'bairesdev.com'],
      [/\bntt\s*data|everis\b/i, 'nttdata', 'nttdata.com'],
      [/\bindra|minsait\b/i, 'indra', 'indracompany.com'],
      [/\binetum\b/i, 'inetum', 'inetum.com'],
      [/\bcanvia\b/i, 'canvia', 'canvia.com'],
      [/\btata consultancy|tcs\b/i, 'tcs', 'tcs.com'],
      [/\bsiemens\b/i, 'siemens', 'siemens.com'],
      [/\bglobant\b/i, 'globant', 'globant.com'],
      [/\bey\b|ernst\s*&\s*young/i, 'ey', 'ey.com'],
      [/\bdeloitte\b/i, 'deloitte', 'deloitte.com'],
      [/\bpwc|pricewaterhouse/i, 'pwc', 'pwc.com'],
      [/\bkpmg\b/i, 'kpmg', 'kpmg.com'],
      [/\bbdo\b/i, 'bdo', 'bdo.com.pe'],
      [/\butp|universidad tecnol[oó]gica\b/i, 'utp', 'utp.edu.pe'],
      [/\bpucp|cat[oó]lica del per[uú]\b/i, 'pucp', 'pucp.edu.pe'],
      [/\busil\b/i, 'usil', 'usil.edu.pe'],
      [/\bupn|privada del norte\b/i, 'upn', 'upn.edu.pe'],
      [/\bupc|laureate|cibertec\b/i, 'upc', 'upc.edu.pe'],
      [/\bauna\b/i, 'auna', 'auna.pe'],
      [/\bsanna\b/i, 'sanna', 'sanna.pe'],
      [/\babbott\b/i, 'abbott', 'abbott.com'],
      [/\baviva\b/i, 'aviva', 'aviva.pe'],
      [/\bvml\b/i, 'vml', 'vml.com'],
      [/\bcoface\b/i, 'coface', 'coface.com'],
      [/\bvainsa\b/i, 'vainsa', 'vainsa.com'],
      [/\braura\b/i, 'raura', 'raura.com.pe'],
      [/\bca[j]a arequipa\b/i, 'cajaarequipa', 'cajaarequipa.pe'],
    ];

    for (const [regex, key, domain] of substringDomains) {
      if (regex.test(rawName)) {
        return { key, domain };
      }
    }

    // 2. Check via resolveEmployer on companyName only
    const resolved = resolveEmployer(companyName || '', '', '');
    if (resolved.brand?.key && COMPANY_DOMAINS[resolved.brand.key]) {
      return { key: resolved.brand.key, domain: COMPANY_DOMAINS[resolved.brand.key] };
    }
  }

  // 3. Fallback to brandKey only when companyName is confidential or unrecognized
  const isConfidential =
    !rawName ||
    rawName.includes('confidencial') ||
    rawName.includes('importante empresa') ||
    rawName === 'unknown';

  if (isConfidential && normKey && COMPANY_DOMAINS[normKey]) {
    return { key: normKey, domain: COMPANY_DOMAINS[normKey] };
  }

  return { key: normKey, domain: null };
}

export function CompanyMonogram({
  brandKey,
  companyName,
  logoUrl,
  size = 'md',
  className = '',
}: CompanyMonogramProps) {
  const [failedStage, setFailedStage] = React.useState<number>(0);

  const { key: resolvedKey, domain } = React.useMemo(
    () => detectCompanyDomain(brandKey, companyName),
    [brandKey, companyName]
  );

  const brand = React.useMemo(
    () => getBrand(resolvedKey || brandKey),
    [resolvedKey, brandKey]
  );

  React.useEffect(() => {
    setFailedStage(0);
  }, [brandKey, companyName, logoUrl]);

  // Build ordered candidate image URLs:
  // 1. Direct portal logo URL (`job.company_logo_url`)
  // 2. Official brand logo URL (`OFFICIAL_BRAND_LOGOS[resolvedKey]`)
  // 3. High-resolution domain favicon (`Google S2 favicons sz=128`)
  const candidateUrls = React.useMemo(() => {
    const urls: string[] = [];
    if (logoUrl && logoUrl.trim().startsWith('http')) {
      urls.push(logoUrl.trim());
    }
    if (resolvedKey && OFFICIAL_BRAND_LOGOS[resolvedKey]) {
      const brandUrl = OFFICIAL_BRAND_LOGOS[resolvedKey];
      if (!urls.includes(brandUrl)) {
        urls.push(brandUrl);
      }
    }
    if (domain) {
      const faviconUrl = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=128`;
      if (!urls.includes(faviconUrl)) {
        urls.push(faviconUrl);
      }
    }
    return urls;
  }, [logoUrl, resolvedKey, domain]);

  const activeImageUrl =
    failedStage < candidateUrls.length ? candidateUrls[failedStage] : null;

  const initials = React.useMemo(() => {
    if (brand?.code) {
      return brand.code.length <= 4 ? brand.code : brand.code.slice(0, 3);
    }
    return extractInitials(companyName);
  }, [brand, companyName]);

  const styleConfig = React.useMemo(() => {
    if (brand?.color && brand?.tint) {
      return {
        backgroundColor: brand.tint,
        color: brand.color,
        borderColor: brand.color + '40',
      };
    }
    const index = hashString(companyName || 'default') % VIBRANT_PALETTE.length;
    const item = VIBRANT_PALETTE[index];
    return {
      backgroundColor: item.bg,
      color: item.text,
      borderColor: item.border,
    };
  }, [brand, companyName]);

  const sizeClasses = {
    sm: 'h-10 w-10 text-xs rounded-xl',
    md: 'h-14 w-14 text-sm font-extrabold rounded-2xl',
    lg: 'h-16 w-16 text-base font-extrabold rounded-2xl',
  }[size];

  if (activeImageUrl) {
    return (
      <div
        className={`inline-flex shrink-0 items-center justify-center overflow-hidden border border-slate-200/90 bg-white p-1.5 shadow-2xs select-none ${sizeClasses} ${className}`}
        aria-hidden="true"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={activeImageUrl}
          alt=""
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setFailedStage((prev) => prev + 1)}
          className="h-full w-full object-contain rounded-lg"
        />
      </div>
    );
  }

  return (
    <div
      className={`inline-flex shrink-0 items-center justify-center border font-extrabold uppercase tracking-wider select-none shadow-xs transition-transform ${sizeClasses} ${className}`}
      style={styleConfig}
      aria-hidden="true"
    >
      <span>{initials}</span>
    </div>
  );
}
