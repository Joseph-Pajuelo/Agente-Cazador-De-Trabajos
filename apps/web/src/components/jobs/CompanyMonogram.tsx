'use client';

import React from 'react';
import { getBrand, resolveEmployer } from '@/lib/domain/companies';

interface CompanyMonogramProps {
  brandKey?: string | null;
  companyName?: string | null;
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
 * Known domains for Peruvian and global employers in Lima's internship market.
 * Used to fetch real high-resolution brand favicons/logos when no custom SVG is defined.
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

function detectCompanyDomain(
  brandKey?: string | null,
  companyName?: string | null
): { key: string; domain: string | null } {
  const normKey = (brandKey || '').toLowerCase().trim();
  if (normKey && COMPANY_DOMAINS[normKey]) {
    return { key: normKey, domain: COMPANY_DOMAINS[normKey] };
  }

  const rawName = (companyName || '').toLowerCase();
  if (!rawName) return { key: '', domain: null };

  // Check via resolveEmployer from companies.ts
  const resolved = resolveEmployer(companyName || '', '', '');
  if (resolved.brand?.key && COMPANY_DOMAINS[resolved.brand.key]) {
    return { key: resolved.brand.key, domain: COMPANY_DOMAINS[resolved.brand.key] };
  }

  // Direct substring match for common Peruvian companies not in BRANDS
  const substringDomains: [RegExp, string, string][] = [
    [/\bscotiabank|scotia\b/i, 'scotiabank', 'scotiabank.com.pe'],
    [/\bbbva\b/i, 'bbva', 'bbva.pe'],
    [/\bbcp|banco de cr[eé]dito\b/i, 'bcp', 'viabcp.com'],
    [/\binterbank\b/i, 'interbank', 'interbank.pe'],
    [/\bmibanco\b/i, 'mibanco', 'mibanco.com.pe'],
    [/\balfin\b/i, 'alfin', 'alfinbanco.pe'],
    [/\bpac[ií]fico\b/i, 'pacifico', 'pacifico.com.pe'],
    [/\br[ií]mac\b/i, 'rimac', 'rimac.com'],
    [/\balicorp\b/i, 'alicorp', 'alicorp.com.pe'],
    [/\bferreyros|ferreycorp\b/i, 'ferreyros', 'ferreyros.com.pe'],
    [/\bentel\b/i, 'entel', 'entel.pe'],
    [/\bclaro|am[eé]rica m[oó]vil\b/i, 'claro', 'claro.com.pe'],
    [/\bmovistar|telef[oó]nica\b/i, 'movistar', 'movistar.com.pe'],
    [/\bfalabella|tottus|sodimac\b/i, 'falabella', 'falabella.com.pe'],
    [/\bripley\b/i, 'ripley', 'ripley.com.pe'],
    [/\bcencosud|wong|metro\b/i, 'cencosud', 'cencosud.com'],
    [/\bcineplanet\b/i, 'cineplanet', 'cineplanet.com.pe'],
    [/\bprimax\b/i, 'primax', 'primax.com.pe'],
    [/\bbcrp|banco central de reserva\b/i, 'bcrp', 'bcrp.gob.pe'],
    [/\bsunat\b/i, 'sunat', 'sunat.gob.pe'],
    [/\bsunarp\b/i, 'sunarp', 'gob.pe'],
    [/\bmincul|ministerio de cultura|ministerio|ugel|gobierno regional\b/i, 'gobpe', 'gob.pe'],
    [/\bcoes\b/i, 'coes', 'coes.org.pe'],
    [/\bpan american silver\b/i, 'panamericansilver', 'panamericansilver.com'],
    [/\bbairesdev\b/i, 'bairesdev', 'bairesdev.com'],
    [/\bntt\s*data|everis\b/i, 'nttdata', 'nttdata.com'],
    [/\bindra|minsait\b/i, 'indra', 'indracompany.com'],
    [/\bglobant\b/i, 'globant', 'globant.com'],
    [/\bey\b|ernst\s*&\s*young/i, 'ey', 'ey.com'],
    [/\bdeloitte\b/i, 'deloitte', 'deloitte.com'],
    [/\bpwc|pricewaterhouse/i, 'pwc', 'pwc.com'],
    [/\bkpmg\b/i, 'kpmg', 'kpmg.com'],
    [/\butp|universidad tecnol[oó]gica\b/i, 'utp', 'utp.edu.pe'],
    [/\bupc|laureate|cibertec\b/i, 'upc', 'upc.edu.pe'],
    [/\bauna\b/i, 'auna', 'auna.pe'],
    [/\bsanna\b/i, 'sanna', 'sanna.pe'],
    [/\baviva\b/i, 'aviva', 'aviva.pe'],
    [/\bvml\b/i, 'vml', 'vml.com'],
    [/\bmanpower\b/i, 'manpower', 'manpowergroup.pe'],
    [/\badecco\b/i, 'adecco', 'adecco.com.pe'],
    [/\boverall\b/i, 'overall', 'overall.pe'],
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

  return { key: normKey, domain: null };
}

/**
 * Renders crisp inline SVG logos for flagship Peruvian employers (matching CVMatcher style)
 * so top banks and institutions always render vector-sharp without network latency.
 */
function renderInlineBrandLogo(key: string): React.ReactNode | null {
  switch (key) {
    case 'scotiabank':
      return (
        <div className="flex flex-col items-center justify-center w-full h-full bg-white p-1">
          <svg viewBox="0 0 40 30" className="w-7 h-5" aria-hidden="true">
            <path
              d="M25.5 3C18.5 3 14 7 14 11.5c0 3.8 2.8 6.2 7.2 7.2 3.2.7 4.8 1.6 4.8 3.3 0 2-2.2 3.5-5.8 3.5-3.2 0-6.2-1.2-8.2-2.8L9.5 26c2.5 2 6.5 3.2 10.8 3.2 7.2 0 11.7-4 11.7-8.7 0-4-2.8-6.4-7.5-7.4-3.2-.7-4.5-1.5-4.5-3.1 0-1.8 2-3.2 5.4-3.2 2.8 0 5.3 1 7.2 2.3L35 5.8C32.5 4 29.2 3 25.5 3z"
              fill="#EC111A"
            />
            <circle cx="20" cy="15" r="3.4" fill="#EC111A" />
          </svg>
          <span className="text-[7px] font-extrabold tracking-tight text-[#EC111A] leading-none mt-0.5">
            Scotiabank
          </span>
        </div>
      );
    case 'bbva':
      return (
        <div className="flex items-center justify-center w-full h-full bg-[#072146] px-1.5">
          <span className="text-[11px] font-black tracking-wider text-white font-sans">
            BBVA
          </span>
        </div>
      );
    case 'bcp':
      return (
        <div className="flex items-center justify-center w-full h-full bg-[#002A8D] px-1">
          <span className="text-[12px] font-black italic tracking-tight text-white">
            &gt;<span className="text-[#FF7800]">B</span>CP
          </span>
        </div>
      );
    case 'interbank':
      return (
        <div className="flex items-center justify-center w-full h-full bg-[#009B3A] px-1">
          <span className="text-[9px] font-black tracking-tight text-white">
            Interbank
          </span>
        </div>
      );
    case 'alfin':
      return (
        <div className="flex flex-col items-center justify-center w-full h-full bg-white px-1">
          <span className="text-[12px] font-black tracking-tight text-[#FF4713] leading-none">
            alf<span className="text-[#2563EB]">i</span>n
          </span>
          <span className="text-[6px] font-bold text-[#1E3A8A] leading-none mt-0.5">
            Banco
          </span>
        </div>
      );
    case 'mibanco':
      return (
        <div className="flex items-center justify-center w-full h-full bg-[#00843D] px-1">
          <span className="text-[9px] font-extrabold text-[#FFD100]">
            mibanco
          </span>
        </div>
      );
    case 'ey':
      return (
        <div className="flex flex-col items-center justify-center w-full h-full bg-[#2E2E38] px-1">
          <div className="w-6 h-1.5 bg-[#FFE600] -skew-x-12 mb-0.5" />
          <span className="text-[12px] font-black text-white leading-none">
            EY
          </span>
        </div>
      );
    case 'bcrp':
      return (
        <div className="flex flex-col items-center justify-center w-full h-full bg-[#1E3A8A] px-1">
          <span className="text-[11px] font-black tracking-wider text-[#FBBF24] leading-none">
            BCRP
          </span>
          <span className="text-[6px] font-semibold text-blue-100 leading-none mt-0.5">
            PERÚ
          </span>
        </div>
      );
    case 'entel':
      return (
        <div className="flex items-center justify-center w-full h-full bg-[#002EFF] px-1">
          <span className="text-[11px] font-black tracking-tight text-white lowercase">
            entel<span className="text-[#FF3D00]">)</span>
          </span>
        </div>
      );
    default:
      return null;
  }
}

export function CompanyMonogram({
  brandKey,
  companyName,
  size = 'md',
  className = '',
}: CompanyMonogramProps) {
  const [imgError, setImgError] = React.useState(false);
  const brand = React.useMemo(() => getBrand(brandKey), [brandKey]);

  const { key: resolvedKey, domain } = React.useMemo(
    () => detectCompanyDomain(brandKey, companyName),
    [brandKey, companyName]
  );

  React.useEffect(() => {
    setImgError(false);
  }, [brandKey, companyName]);

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

  const inlineLogo = renderInlineBrandLogo(resolvedKey);
  if (inlineLogo) {
    return (
      <div
        className={`inline-flex shrink-0 items-center justify-center overflow-hidden border border-slate-200 bg-white shadow-xs select-none ${sizeClasses} ${className}`}
        aria-hidden="true"
      >
        {inlineLogo}
      </div>
    );
  }

  if (domain && !imgError) {
    return (
      <div
        className={`inline-flex shrink-0 items-center justify-center overflow-hidden border border-slate-200 bg-white p-2 shadow-xs select-none ${sizeClasses} ${className}`}
        aria-hidden="true"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=128`}
          alt=""
          loading="lazy"
          onError={() => setImgError(true)}
          className="h-full w-full object-contain"
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
