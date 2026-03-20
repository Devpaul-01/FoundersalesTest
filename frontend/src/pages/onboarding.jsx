// src/pages/onboarding.jsx
// ============================================================
// ONBOARDING WIZARD — Hybrid-Progressive AI Questions
//
// AUDIT FIXES (v2):
//  FIX-01  data.message → data.sample_message (Critical Bug #2)
//          The wow moment sample message now actually renders.
//  FIX-02  websites sent as 'websites' (array) — matches backend Option B
//  FIX-03  setLoading(false) added in Step3 handleComplete finally block
//  FIX-04  setAllAnswers uses functional update form to prevent stale closure
//  FIX-05  Step 2 back navigation — "← Edit my info" shown on Q1 of Burst 1
//  NEW     ~195 countries + states/provinces for 15 key countries
//  NEW     experience_level, business_stage, country/state contextually
//          injected into Groq prompts (via backend — no frontend changes needed)
// ============================================================

import React, { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../stores/authStore'
import api from '../services/api'
import Button from '../components/ui/Button'
import Input, { Textarea } from '../components/ui/Input'
import { SkeletonText } from '../components/ui/Skeleton'
import toast from 'react-hot-toast'

// ── Constants ─────────────────────────────────────────────────────────────────
const ROLES      = ['Founder', 'Sales', 'Freelancer', 'Marketer', 'Creator', 'Student', 'Other']
const INDUSTRIES = ['SaaS', 'E-commerce', 'Services', 'Fintech', 'Creator/Media', 'Education', 'Food & Beverage', 'Health', 'Other']
const EXPERIENCE = ['Beginner', 'Intermediate', 'Advanced']

const BUSINESS_STAGES = [
  { key: 'pre_revenue',     label: 'Pre-Revenue',     desc: '0 customers' },
  { key: 'first_customers', label: 'First Customers', desc: '1–10 customers' },
  { key: 'early_traction',  label: 'Early Traction',  desc: '$1k–$10k MRR' },
  { key: 'growing',         label: 'Growing',         desc: '$10k+ MRR' },
]

const PLATFORMS = [
  { key: 'reddit',       label: 'Reddit',         icon: '🟠' },
  { key: 'linkedin',     label: 'LinkedIn',        icon: '💼' },
  { key: 'twitter',      label: 'X / Twitter',     icon: '🐦' },
  { key: 'instagram',    label: 'Instagram',       icon: '📸' },
  { key: 'facebook',     label: 'Facebook',        icon: '📘' },
  { key: 'indiehackers', label: 'Indie Hackers',   icon: '👨‍💻' },
  { key: 'producthunt',  label: 'Product Hunt',    icon: '🚀' },
  { key: 'hackernews',   label: 'Hacker News',     icon: '🔶' },
  { key: 'quora',        label: 'Quora',           icon: '❓' },
  { key: 'youtube',      label: 'YouTube',         icon: '▶️' },
]

const INDUSTRY_DEEP_DIVE = {
  'SaaS':            'What is your current churn rate or primary growth bottleneck?',
  'E-commerce':      'What is your average ROAS or Customer Acquisition Cost (CAC)?',
  'Services':        'What is your biggest headache with lead quality right now?',
  'Fintech':         'What regulatory or trust barrier slows your sales the most?',
  'Creator/Media':   'What is your current audience size and biggest monetisation challenge?',
  'Education':       "What does your student success rate look like, and what's the biggest drop-off point?",
  'Food & Beverage': "Where do you currently sell, and what's your biggest challenge with customer repeat purchases?",
  'Health':          'What compliance or trust barriers do you face when acquiring customers?',
  'Other':           "What's the #1 metric that defines whether a customer is successful with you?",
}

const BURST_LABELS = ['The Foundation', 'The Prospect', 'The Persona']

// ── Comprehensive location data ───────────────────────────────────────────────
// ~195 countries (all UN member states + Kosovo, Palestine, Taiwan)
const COUNTRIES = [
  'Afghanistan', 'Albania', 'Algeria', 'Andorra', 'Angola',
  'Antigua and Barbuda', 'Argentina', 'Armenia', 'Australia', 'Austria', 'Azerbaijan',
  'Bahamas', 'Bahrain', 'Bangladesh', 'Barbados', 'Belarus', 'Belgium', 'Belize',
  'Benin', 'Bhutan', 'Bolivia', 'Bosnia and Herzegovina', 'Botswana', 'Brazil',
  'Brunei', 'Bulgaria', 'Burkina Faso', 'Burundi',
  'Cabo Verde', 'Cambodia', 'Cameroon', 'Canada',
  'Central African Republic', 'Chad', 'Chile', 'China', 'Colombia', 'Comoros',
  'Congo (DRC)', 'Congo (Republic)', 'Costa Rica', 'Croatia', 'Cuba',
  'Cyprus', 'Czech Republic',
  'Denmark', 'Djibouti', 'Dominica', 'Dominican Republic',
  'Ecuador', 'Egypt', 'El Salvador', 'Equatorial Guinea', 'Eritrea', 'Estonia',
  'Eswatini', 'Ethiopia',
  'Fiji', 'Finland', 'France',
  'Gabon', 'Gambia', 'Georgia', 'Germany', 'Ghana', 'Greece', 'Grenada',
  'Guatemala', 'Guinea', 'Guinea-Bissau', 'Guyana',
  'Haiti', 'Honduras', 'Hungary',
  'Iceland', 'India', 'Indonesia', 'Iran', 'Iraq', 'Ireland', 'Israel', 'Italy',
  'Jamaica', 'Japan', 'Jordan',
  'Kazakhstan', 'Kenya', 'Kiribati', 'Kosovo', 'Kuwait', 'Kyrgyzstan',
  'Laos', 'Latvia', 'Lebanon', 'Lesotho', 'Liberia', 'Libya', 'Liechtenstein',
  'Lithuania', 'Luxembourg',
  'Madagascar', 'Malawi', 'Malaysia', 'Maldives', 'Mali', 'Malta',
  'Marshall Islands', 'Mauritania', 'Mauritius', 'Mexico', 'Micronesia',
  'Moldova', 'Monaco', 'Mongolia', 'Montenegro', 'Morocco', 'Mozambique', 'Myanmar',
  'Namibia', 'Nauru', 'Nepal', 'Netherlands', 'New Zealand', 'Nicaragua', 'Niger',
  'Nigeria', 'North Korea', 'North Macedonia', 'Norway',
  'Oman',
  'Pakistan', 'Palau', 'Palestine', 'Panama', 'Papua New Guinea', 'Paraguay',
  'Peru', 'Philippines', 'Poland', 'Portugal',
  'Qatar',
  'Romania', 'Russia', 'Rwanda',
  'Saint Kitts and Nevis', 'Saint Lucia', 'Saint Vincent and the Grenadines',
  'Samoa', 'San Marino', 'Sao Tome and Principe', 'Saudi Arabia', 'Senegal',
  'Serbia', 'Seychelles', 'Sierra Leone', 'Singapore', 'Slovakia', 'Slovenia',
  'Solomon Islands', 'Somalia', 'South Africa', 'South Korea', 'South Sudan',
  'Spain', 'Sri Lanka', 'Sudan', 'Suriname', 'Sweden', 'Switzerland', 'Syria',
  'Taiwan', 'Tajikistan', 'Tanzania', 'Thailand', 'Timor-Leste', 'Togo', 'Tonga',
  'Trinidad and Tobago', 'Tunisia', 'Turkey', 'Turkmenistan', 'Tuvalu',
  'Uganda', 'Ukraine', 'United Arab Emirates', 'United Kingdom', 'United States',
  'Uruguay', 'Uzbekistan',
  'Vanuatu', 'Vatican City', 'Venezuela', 'Vietnam',
  'Yemen',
  'Zambia', 'Zimbabwe',
  'Other',
]

// States / provinces for the 15 most relevant countries on this platform.
// All other countries show no state picker (country-level granularity is enough).
const STATES_BY_COUNTRY = {
  'United States': [
    'Alabama','Alaska','Arizona','Arkansas','California','Colorado','Connecticut',
    'Delaware','Florida','Georgia','Hawaii','Idaho','Illinois','Indiana','Iowa',
    'Kansas','Kentucky','Louisiana','Maine','Maryland','Massachusetts','Michigan',
    'Minnesota','Mississippi','Missouri','Montana','Nebraska','Nevada',
    'New Hampshire','New Jersey','New Mexico','New York','North Carolina',
    'North Dakota','Ohio','Oklahoma','Oregon','Pennsylvania','Rhode Island',
    'South Carolina','South Dakota','Tennessee','Texas','Utah','Vermont',
    'Virginia','Washington','West Virginia','Wisconsin','Wyoming','Washington D.C.',
  ],
  'Canada': [
    'Alberta','British Columbia','Manitoba','New Brunswick',
    'Newfoundland and Labrador','Northwest Territories','Nova Scotia','Nunavut',
    'Ontario','Prince Edward Island','Quebec','Saskatchewan','Yukon',
  ],
  'Australia': [
    'Australian Capital Territory','New South Wales','Northern Territory',
    'Queensland','South Australia','Tasmania','Victoria','Western Australia',
  ],
  'United Kingdom': [
    'England', 'Northern Ireland', 'Scotland', 'Wales',
  ],
  'Germany': [
    'Baden-Württemberg','Bavaria','Berlin','Brandenburg','Bremen','Hamburg',
    'Hesse','Lower Saxony','Mecklenburg-Vorpommern','North Rhine-Westphalia',
    'Rhineland-Palatinate','Saarland','Saxony','Saxony-Anhalt',
    'Schleswig-Holstein','Thuringia',
  ],
  'India': [
    'Andhra Pradesh','Arunachal Pradesh','Assam','Bihar','Chhattisgarh','Goa',
    'Gujarat','Haryana','Himachal Pradesh','Jharkhand','Karnataka','Kerala',
    'Madhya Pradesh','Maharashtra','Manipur','Meghalaya','Mizoram','Nagaland',
    'Odisha','Punjab','Rajasthan','Sikkim','Tamil Nadu','Telangana','Tripura',
    'Uttar Pradesh','Uttarakhand','West Bengal','Delhi',
  ],
  'Nigeria': [
    'Abia','Adamawa','Akwa Ibom','Anambra','Bauchi','Bayelsa','Benue','Borno',
    'Cross River','Delta','Ebonyi','Edo','Ekiti','Enugu','FCT','Gombe','Imo',
    'Jigawa','Kaduna','Kano','Katsina','Kebbi','Kogi','Kwara','Lagos','Nasarawa',
    'Niger','Ogun','Ondo','Osun','Oyo','Plateau','Rivers','Sokoto','Taraba',
    'Yobe','Zamfara',
  ],
  'Brazil': [
    'Acre','Alagoas','Amapá','Amazonas','Bahia','Ceará','Distrito Federal',
    'Espírito Santo','Goiás','Maranhão','Mato Grosso','Mato Grosso do Sul',
    'Minas Gerais','Pará','Paraíba','Paraná','Pernambuco','Piauí',
    'Rio de Janeiro','Rio Grande do Norte','Rio Grande do Sul','Rondônia',
    'Roraima','Santa Catarina','São Paulo','Sergipe','Tocantins',
  ],
  'Mexico': [
    'Aguascalientes','Baja California','Baja California Sur','Campeche','Chiapas',
    'Chihuahua','Ciudad de México','Coahuila','Colima','Durango','Guanajuato',
    'Guerrero','Hidalgo','Jalisco','México State','Michoacán','Morelos','Nayarit',
    'Nuevo León','Oaxaca','Puebla','Querétaro','Quintana Roo','San Luis Potosí',
    'Sinaloa','Sonora','Tabasco','Tamaulipas','Tlaxcala','Veracruz','Yucatán',
    'Zacatecas',
  ],
  'South Africa': [
    'Eastern Cape','Free State','Gauteng','KwaZulu-Natal','Limpopo','Mpumalanga',
    'North West','Northern Cape','Western Cape',
  ],
  'China': [
    'Anhui','Beijing','Chongqing','Fujian','Gansu','Guangdong','Guangxi',
    'Guizhou','Hainan','Hebei','Heilongjiang','Henan','Hong Kong','Hubei',
    'Hunan','Inner Mongolia','Jiangsu','Jiangxi','Jilin','Liaoning','Macau',
    'Ningxia','Qinghai','Shaanxi','Shandong','Shanghai','Shanxi','Sichuan',
    'Tianjin','Tibet','Xinjiang','Yunnan','Zhejiang',
  ],
  'Japan': [
    'Aichi','Akita','Aomori','Chiba','Ehime','Fukui','Fukuoka','Fukushima',
    'Gifu','Gunma','Hiroshima','Hokkaido','Hyogo','Ibaraki','Ishikawa','Iwate',
    'Kagawa','Kagoshima','Kanagawa','Kochi','Kumamoto','Kyoto','Mie','Miyagi',
    'Miyazaki','Nagano','Nagasaki','Nara','Niigata','Oita','Okayama','Okinawa',
    'Osaka','Saga','Saitama','Shiga','Shimane','Shizuoka','Tochigi','Tokushima',
    'Tokyo','Tottori','Toyama','Wakayama','Yamagata','Yamaguchi','Yamanashi',
  ],
  'France': [
    'Auvergne-Rhône-Alpes','Bourgogne-Franche-Comté','Brittany',
    'Centre-Val de Loire','Corsica','Grand Est','Hauts-de-France',
    'Île-de-France','Normandy','Nouvelle-Aquitaine','Occitanie',
    'Pays de la Loire','Provence-Alpes-Côte d\'Azur',
  ],
  'Spain': [
    'Andalusia','Aragon','Asturias','Balearic Islands','Basque Country',
    'Canary Islands','Cantabria','Castile and León','Castile-La Mancha',
    'Catalonia','Extremadura','Galicia','La Rioja','Madrid','Murcia',
    'Navarre','Valencia',
  ],
  'Italy': [
    'Abruzzo','Aosta Valley','Apulia','Basilicata','Calabria','Campania',
    'Emilia-Romagna','Friuli-Venezia Giulia','Lazio','Liguria','Lombardy',
    'Marche','Molise','Piedmont','Sardinia','Sicily','Trentino-South Tyrol',
    'Tuscany','Umbria','Veneto',
  ],
  'United Arab Emirates': [
    'Abu Dhabi','Ajman','Dubai','Fujairah','Ras al-Khaimah','Sharjah',
    'Umm al-Quwain',
  ],
  'Argentina': [
    'Buenos Aires Province','Buenos Aires (CABA)','Catamarca','Chaco','Chubut',
    'Córdoba','Corrientes','Entre Ríos','Formosa','Jujuy','La Pampa','La Rioja',
    'Mendoza','Misiones','Neuquén','Río Negro','Salta','San Juan','San Luis',
    'Santa Cruz','Santa Fe','Santiago del Estero','Tierra del Fuego','Tucumán',
  ],
  'Netherlands': [
    'Drenthe','Flevoland','Friesland','Gelderland','Groningen','Limburg',
    'North Brabant','North Holland','Overijssel','South Holland','Utrecht',
    'Zeeland',
  ],
}

// ── Reusable Chip ─────────────────────────────────────────────────────────────
function Chip({ label, icon, selected, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`
        flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium border transition-all duration-150
        ${selected
          ? 'bg-primary border-primary text-white shadow-glow-sm'
          : 'bg-surface-panel border-surface-border text-text-muted hover:border-surface-mid hover:text-text-secondary'
        }
      `}
    >
      {icon && <span>{icon}</span>}
      {label}
    </button>
  )
}

// ── Progress Bar ──────────────────────────────────────────────────────────────
function ProgressBar({ step, total }) {
  return (
    <div className="flex items-center gap-2 mb-8">
      {Array.from({ length: total }).map((_, i) => (
        <div
          key={i}
          className={`h-1 flex-1 rounded-full transition-all duration-300 ${
            i < step ? 'bg-primary' : i === step ? 'bg-primary/40' : 'bg-surface-border'
          }`}
        />
      ))}
    </div>
  )
}

// ── Multiple Websites Input ───────────────────────────────────────────────────
function WebsitesInput({ websites, onChange }) {
  const addWebsite = () => {
    if (websites.length >= 5) return
    onChange([...websites, ''])
  }
  const updateWebsite = (index, value) => {
    const updated = [...websites]
    updated[index] = value
    onChange(updated)
  }
  const removeWebsite = (index) => {
    onChange(websites.filter((_, i) => i !== index))
  }

  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-text-secondary">
        Websites / Social profiles (optional)
      </label>
      {websites.map((url, i) => (
        <div key={i} className="flex gap-2">
          <input
            type="url"
            placeholder={i === 0 ? 'https://yoursite.com' : 'https://linkedin.com/in/yourname'}
            value={url}
            onChange={e => updateWebsite(i, e.target.value)}
            className="flex-1 px-3 py-2 text-sm bg-surface-panel border border-surface-border rounded-xl text-text-primary placeholder:text-text-muted focus:outline-none focus:border-primary/60 focus:ring-1 focus:ring-primary/20 transition-all"
          />
          {websites.length > 1 && (
            <button
              type="button"
              onClick={() => removeWebsite(i)}
              className="px-2 py-2 rounded-xl text-text-muted hover:text-error hover:bg-error/10 transition-colors text-sm"
            >
              ✕
            </button>
          )}
        </div>
      ))}
      {websites.length < 5 && (
        <button
          type="button"
          onClick={addWebsite}
          className="text-xs text-primary-glow hover:text-primary transition-colors flex items-center gap-1"
        >
          + Add another link
        </button>
      )}
    </div>
  )
}

// ── Step 1: Basic Info ────────────────────────────────────────────────────────
function Step1({ onNext }) {
  const [form, setForm] = useState({
    name:                '',
    business_name:       '',
    product_description: '',
    target_audience:     '',
    bio:                 '',
    websites:            [''],      // FIX-02: plural array — matches backend Option B
    preferred_platforms: [],
    role:                '',
    industry:            '',
    experience_level:    '',
    industry_deep_dive:  '',
    primary_goal:        '',
    country:             '',
    state:               '',
    business_stage:      '',
    goal_target_value:   '',
    goal_target_unit:    '',
    goal_target_date:    '',
  })
  const [errors, setErrors]   = useState({})
  const [loading, setLoading] = useState(false)

  const deepDiveQuestion = form.industry ? INDUSTRY_DEEP_DIVE[form.industry] : null

  const togglePlatform = (key) => {
    const current = form.preferred_platforms
    setForm({
      ...form,
      preferred_platforms: current.includes(key)
        ? current.filter(p => p !== key)
        : [...current, key],
    })
  }

  const validate = () => {
    const e = {}
    if (!form.product_description.trim()) e.product_description = 'Required'
    if (!form.target_audience.trim())     e.target_audience     = 'Required'
    if (!form.role)                       e.role                = 'Please select your role'
    setErrors(e)
    return !Object.keys(e).length
  }

  const handleNext = async () => {
    if (!validate()) return
    setLoading(true)
    try {
      // FIX-02: Send `websites` (array) — backend expects this field name
      const cleanWebsites = form.websites.filter(w => w.trim().length > 5)

      const { data } = await api.post('/onboarding/basic', {
        name:                form.name,
        business_name:       form.business_name,
        product_description: form.product_description,
        target_audience:     form.target_audience,
        bio:                 form.bio,
        websites:            cleanWebsites,          // ← plural array (Option B)
        preferred_platforms: form.preferred_platforms,
        role:                form.role?.toLowerCase(),
        industry:            form.industry?.toLowerCase(),
        experience_level:    form.experience_level?.toLowerCase(),
        industry_deep_dive:  form.industry_deep_dive,
        primary_goal:        form.primary_goal,
        country:             form.country || null,
        state:               form.state   || null,
        business_stage:      form.business_stage    || null,
        goal_target_value:   form.goal_target_value ? parseFloat(form.goal_target_value) : null,
        goal_target_unit:    form.goal_target_unit  || null,
        goal_target_date:    form.goal_target_date  || null,
      })
      onNext({ burst1: data.burst1, basicInfo: form, aiSource: data.ai_source })
    } catch (err) {
      toast.error(err.response?.data?.message || 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6 animate-fade-in-up">
      <div>
        <h2 className="text-2xl font-bold font-display text-text-primary">Tell Clutch about yourself</h2>
        <p className="text-text-muted text-sm mt-1">This builds your AI co-founder profile — the more specific, the better</p>
      </div>

      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <Input
            label="Your name"
            placeholder="Alex Johnson"
            value={form.name}
            onChange={e => setForm({ ...form, name: e.target.value })}
          />
          <Input
            label="Business name"
            placeholder="Acme Inc."
            value={form.business_name}
            onChange={e => setForm({ ...form, business_name: e.target.value })}
          />
        </div>

        <Textarea
          label="What you do / offer *"
          placeholder="I help SaaS founders find their first 100 customers through personalized AI outreach..."
          value={form.product_description}
          onChange={e => setForm({ ...form, product_description: e.target.value })}
          error={errors.product_description}
          rows={3}
        />

        <Textarea
          label="Who you serve *"
          placeholder="Early-stage B2B SaaS founders with 0-10 employees, pre-revenue to $10k MRR..."
          value={form.target_audience}
          onChange={e => setForm({ ...form, target_audience: e.target.value })}
          error={errors.target_audience}
          rows={2}
        />

        {/* Multiple websites */}
        <WebsitesInput
          websites={form.websites}
          onChange={websites => setForm({ ...form, websites })}
        />

        {/* Role */}
        <div>
          <label className="block text-sm font-medium text-text-secondary mb-2">Your role *</label>
          <div className="flex flex-wrap gap-2">
            {ROLES.map(r => (
              <Chip
                key={r}
                label={r}
                selected={form.role === r}
                onClick={() => setForm({ ...form, role: r })}
              />
            ))}
          </div>
          {errors.role && <p className="text-xs text-error mt-1">{errors.role}</p>}
        </div>

        {/* Industry */}
        <div>
          <label className="block text-sm font-medium text-text-secondary mb-2">Industry</label>
          <div className="flex flex-wrap gap-2">
            {INDUSTRIES.map(ind => (
              <Chip
                key={ind}
                label={ind}
                selected={form.industry === ind}
                onClick={() => setForm({ ...form, industry: ind, industry_deep_dive: '' })}
              />
            ))}
          </div>
        </div>

        {/* Dynamic deep-dive based on industry */}
        {deepDiveQuestion && (
          <div className="animate-fade-in-up">
            <Textarea
              label={`🎯 ${deepDiveQuestion}`}
              placeholder="Be specific — real numbers and examples make your AI much more powerful. If you don't have numbers yet, describe the challenge in plain English."
              value={form.industry_deep_dive}
              onChange={e => setForm({ ...form, industry_deep_dive: e.target.value })}
              rows={2}
            />
          </div>
        )}

        {/* Experience */}
        <div>
          <label className="block text-sm font-medium text-text-secondary mb-2">Experience level</label>
          <div className="flex flex-wrap gap-2">
            {EXPERIENCE.map(exp => (
              <Chip
                key={exp}
                label={exp}
                selected={form.experience_level === exp}
                onClick={() => setForm({ ...form, experience_level: exp })}
              />
            ))}
          </div>
        </div>

        {/* Business stage */}
        <div>
          <label className="block text-sm font-medium text-text-secondary mb-1">Where are you right now?</label>
          <p className="text-xs text-text-muted mb-2">Helps Clutch calibrate advice to your actual stage</p>
          <div className="flex flex-wrap gap-2">
            {BUSINESS_STAGES.map(s => (
              <Chip
                key={s.key}
                label={s.label}
                selected={form.business_stage === s.key}
                onClick={() => setForm({ ...form, business_stage: s.key })}
              />
            ))}
          </div>
        </div>

        {/* Platform preferences */}
        <div>
          <label className="block text-sm font-medium text-text-secondary mb-1">Platforms you use most</label>
          <p className="text-xs text-text-muted mb-2">Clutch will search these platforms for your opportunities</p>
          <div className="flex flex-wrap gap-2">
            {PLATFORMS.map(p => (
              <Chip
                key={p.key}
                icon={p.icon}
                label={p.label}
                selected={form.preferred_platforms.includes(p.key)}
                onClick={() => togglePlatform(p.key)}
              />
            ))}
          </div>
        </div>

        {/* Bio / backstory */}
        <div>
          <Textarea
            label="Your backstory (optional but powerful)"
            placeholder="e.g. Former enterprise sales rep who got tired of impersonal outreach. Built this after spending $50k on agencies sending copy-paste DMs..."
            value={form.bio}
            onChange={e => setForm({ ...form, bio: e.target.value })}
            rows={2}
          />
          <p className="text-xs text-text-muted mt-1">Your story makes the AI sound genuinely human. The more real, the better.</p>
        </div>

        {/* Country + State */}
        <div>
          <label className="block text-sm font-medium text-text-secondary mb-2">Your location</label>
          <p className="text-xs text-text-muted mb-2">Helps Clutch find relevant opportunities and advice for your market</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <select
                value={form.country}
                onChange={e => setForm({ ...form, country: e.target.value, state: '' })}
                className="w-full px-3 py-2.5 text-sm bg-surface-panel border border-surface-border rounded-xl text-text-primary focus:outline-none focus:border-primary/60 transition-all"
              >
                <option value="">— Country —</option>
                {COUNTRIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            {STATES_BY_COUNTRY[form.country] && (
              <div className="animate-fade-in-up">
                <select
                  value={form.state}
                  onChange={e => setForm({ ...form, state: e.target.value })}
                  className="w-full px-3 py-2.5 text-sm bg-surface-panel border border-surface-border rounded-xl text-text-primary focus:outline-none focus:border-primary/60 transition-all"
                >
                  <option value="">— State / Region —</option>
                  {STATES_BY_COUNTRY[form.country].map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            )}
          </div>
        </div>

        {/* Light goal question */}
        <div>
          <Input
            label="What's your #1 goal right now? (optional)"
            placeholder="e.g. Get 5 paying clients this month, Grow to 1000 followers, Land my first freelance project..."
            value={form.primary_goal}
            onChange={e => setForm({ ...form, primary_goal: e.target.value })}
          />
          <p className="text-xs text-text-muted mt-1">This helps Clutch give you advice that actually points toward what you want.</p>
        </div>

        {form.primary_goal.trim().length > 3 && (
          <div className="grid grid-cols-3 gap-3 animate-fade-in-up">
            <Input
              label="Target number"
              type="number"
              placeholder="e.g. 10"
              value={form.goal_target_value}
              onChange={e => setForm({ ...form, goal_target_value: e.target.value })}
            />
            <Input
              label="Unit"
              placeholder="e.g. customers"
              value={form.goal_target_unit}
              onChange={e => setForm({ ...form, goal_target_unit: e.target.value })}
            />
            <Input
              label="By when?"
              type="date"
              value={form.goal_target_date}
              onChange={e => setForm({ ...form, goal_target_date: e.target.value })}
            />
          </div>
        )}
      </div>

      <Button fullWidth loading={loading} onClick={handleNext}>
        Continue →
      </Button>
    </div>
  )
}

// ── AI Interlude between question bursts ──────────────────────────────────────
function AIInterlude({ message, onContinue }) {
  return (
    <div className="space-y-6 animate-fade-in-up text-center">
      <div className="flex items-center justify-center gap-1.5 py-4">
        {[0, 150, 300].map(delay => (
          <div key={delay} className="w-2.5 h-2.5 rounded-full bg-primary animate-bounce" style={{ animationDelay: `${delay}ms` }} />
        ))}
      </div>
      <div className="bg-primary/5 border border-primary/20 rounded-2xl p-5 text-left">
        <p className="text-xs text-primary-glow font-semibold mb-2 uppercase tracking-wider">Clutch — Strategy Analysis</p>
        <p className="text-sm text-text-secondary leading-relaxed">{message}</p>
      </div>
      <Button fullWidth onClick={onContinue}>Keep going →</Button>
    </div>
  )
}

// ── Step 2: Hybrid-Progressive Question Bursts ────────────────────────────────
// FIX-05: Added onBack prop — allows "← Edit my info" on Q1 of Burst 1
function Step2({ burst1, basicInfo, onNext, onBack }) {
  const TOTAL_BURSTS        = 3
  const QUESTIONS_PER_BURST = 3
  const [currentBurst, setCurrentBurst]    = useState(1)
  const [currentQ, setCurrentQ]            = useState(0)
  const [burstQuestions, setBurstQuestions] = useState(burst1 || [])
  const [burstAnswers, setBurstAnswers]     = useState({})
  const [allAnswers, setAllAnswers]         = useState({})
  const [showInterlude, setShowInterlude]   = useState(false)
  const [interludeMsg, setInterludeMsg]     = useState('')
  const [loadingNext, setLoadingNext]       = useState(false)
  const [submitting, setSubmitting]         = useState(false)
  const textareaRef = useRef(null)

  useEffect(() => {
    if (!showInterlude && textareaRef.current) textareaRef.current.focus()
  }, [currentQ, currentBurst, showInterlude])

  if (!burstQuestions?.length) {
    return <div className="space-y-4 py-4"><SkeletonText lines={5} /></div>
  }

  const q             = burstQuestions[currentQ]
  const answer        = burstAnswers[q] || ''
  const isLastQ       = currentQ === burstQuestions.length - 1
  const isLastBurst   = currentBurst === TOTAL_BURSTS
  const totalAnswered = (currentBurst - 1) * QUESTIONS_PER_BURST + currentQ
  const progressPct   = Math.round((totalAnswered / (TOTAL_BURSTS * QUESTIONS_PER_BURST)) * 100)

  const handleNext = async () => {
    if (!answer.trim()) { toast('Please answer this question first'); return }

    const updatedBurst = { ...burstAnswers, [q]: answer }
    setBurstAnswers(updatedBurst)

    // FIX-04: Use functional update to prevent stale closure on allAnswers
    const updatedAll = await new Promise(resolve => {
      setAllAnswers(prev => {
        const next = { ...prev, [q]: answer }
        resolve(next)
        return next
      })
    })

    if (!isLastQ) { setCurrentQ(currentQ + 1); return }
    if (isLastBurst) { await handleFinalSubmit(updatedAll); return }
    await fetchNextBurst(updatedAll)
  }

  const fetchNextBurst = async (allAns) => {
    setLoadingNext(true)
    try {
      // NOTE: basic_info is sent for UI rendering hints only.
      // The backend re-fetches it from the DB for AI prompt context (FIX-02).
      const { data } = await api.post('/onboarding/questions/next', {
        burst_number:     currentBurst + 1,
        previous_answers: allAns,
        basic_info:       basicInfo,   // UI context only — not used for AI prompts
      })
      setInterludeMsg(data.interlude_message)
      setBurstQuestions(data.questions)
      setBurstAnswers({})
      setCurrentQ(0)
      setCurrentBurst(currentBurst + 1)
      setShowInterlude(true)
    } catch { toast.error('Trouble loading next questions') }
    finally { setLoadingNext(false) }
  }

  const handleFinalSubmit = async (finalAnswers) => {
    setSubmitting(true)
    try {
      const { data } = await api.post('/onboarding/answers', { answers: finalAnswers })
      onNext({ voiceProfile: data.voice_profile })
    } catch (err) { toast.error(err.response?.data?.message || 'Something went wrong') }
    finally { setSubmitting(false) }
  }

  if (showInterlude) {
    return <AIInterlude message={interludeMsg} onContinue={() => setShowInterlude(false)} />
  }

  return (
    <div className="space-y-6 animate-fade-in-up">
      {/* Progress */}
      <div>
        <div className="flex justify-between mb-1">
          <span className="text-xs text-text-muted font-medium">Burst {currentBurst}/{TOTAL_BURSTS} — {BURST_LABELS[currentBurst - 1]}</span>
          <span className="text-xs text-text-muted">{progressPct}%</span>
        </div>
        <div className="h-1 bg-surface-border rounded-full overflow-hidden">
          <div className="h-full bg-primary rounded-full transition-all duration-500" style={{ width: `${progressPct}%` }} />
        </div>
        <div className="flex items-center gap-1 mt-2">
          {BURST_LABELS.map((label, i) => (
            <React.Fragment key={label}>
              <div className={`w-1.5 h-1.5 rounded-full transition-all ${
                i + 1 < currentBurst ? 'bg-success' : i + 1 === currentBurst ? 'bg-primary' : 'bg-surface-border'
              }`} />
              {i < BURST_LABELS.length - 1 && <div className="w-4 h-px bg-surface-border" />}
            </React.Fragment>
          ))}
          <span className="text-xs text-text-muted ml-2">{BURST_LABELS[currentBurst - 1]}</span>
        </div>
      </div>

      <div>
        <span className="text-xs text-primary-glow font-semibold uppercase tracking-wider">
          Q{(currentBurst - 1) * QUESTIONS_PER_BURST + currentQ + 1}
        </span>
        <h2 className="text-xl font-bold font-display text-text-primary leading-snug mt-1">{q}</h2>
        <p className="text-text-muted text-sm mt-1">Specific examples and real numbers beat vague descriptions every time</p>
      </div>

      <Textarea
        ref={textareaRef}
        placeholder="Real examples beat generic descriptions. Think: who, what, how much, when."
        value={answer}
        onChange={e => setBurstAnswers({ ...burstAnswers, [q]: e.target.value })}
        rows={5}
        autoFocus
      />

      <div className="flex gap-3">
        {/* FIX-05: Back navigation
            - On Q1+ within a burst: go to previous question
            - On Q1 of Burst 1: offer "← Edit my info" to reset to Step 1   */}
        {currentQ > 0 && (
          <Button variant="secondary" onClick={() => setCurrentQ(currentQ - 1)}>← Back</Button>
        )}
        {currentQ === 0 && currentBurst === 1 && onBack && (
          <Button variant="secondary" onClick={onBack}>← Edit info</Button>
        )}
        <Button fullWidth loading={loadingNext || submitting} onClick={handleNext}>
          {isLastBurst && isLastQ ? 'Build my profile →' : isLastQ ? 'Next section →' : 'Next →'}
        </Button>
      </div>
    </div>
  )
}

// ── Step 3: Profile Review + Sample Message (wow moment) ─────────────────────
function Step3({ voiceProfile, onComplete }) {
  const [loading, setLoading]             = useState(false)
  const [sampleMessage, setSampleMessage] = useState(null)
  const [msgLoading, setMsgLoading]       = useState(false)
  const [copied, setCopied]               = useState(false)

  const fields = [
    { key: 'unique_value_prop',           label: 'What makes you different' },
    { key: 'target_customer_description', label: 'Your ideal customer' },
    { key: 'outreach_persona',            label: 'Your voice & style' },
    { key: 'best_proof_point',            label: 'Strongest proof point' },
  ]

  // Auto-fetch sample message on mount to create the 'wow' moment
  useEffect(() => {
    const fetchSample = async () => {
      setMsgLoading(true)
      try {
        const { data } = await api.post('/onboarding/sample-message')
        // FIX-01: was data.message (status string) — must be data.sample_message
        setSampleMessage(data.sample_message)
      } catch {
        // Silent — sample message is non-critical, wow moment still works without it
      } finally {
        setMsgLoading(false)
      }
    }
    fetchSample()
  }, [])

  const handleCopy = () => {
    if (!sampleMessage) return
    navigator.clipboard.writeText(sampleMessage)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  // FIX-03: setLoading(false) was missing — spinner would stick if
  // opportunities/refresh succeeded or failed and component stayed mounted
  const handleComplete = async () => {
    setLoading(true)
    try {
      await api.post('/opportunities/refresh')
    } catch {
      // Non-critical — backend already triggered this after /answers
    } finally {
      setLoading(false)
      onComplete()
    }
  }

  return (
    <div className="space-y-6 animate-fade-in-up">
      <div>
        <div className="flex items-center gap-2 mb-2">
          <div className="w-6 h-6 rounded-full bg-success/10 border border-success/20 flex items-center justify-center">
            <svg viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5 text-success">
              <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" />
            </svg>
          </div>
          <span className="text-xs text-success font-medium">Profile built!</span>
        </div>
        <h2 className="text-2xl font-bold font-display text-text-primary">Here's how Clutch sees you</h2>
        <p className="text-text-muted text-sm mt-1">This powers every message, tip, and strategy Clutch generates for you</p>
      </div>

      {/* Voice profile fields */}
      <div className="space-y-3">
        {fields.map(({ key, label }) => (
          voiceProfile?.[key] && (
            <div key={key} className="bg-surface-panel border border-surface-border rounded-xl p-4">
              <p className="text-xs text-text-muted font-medium mb-1">{label}</p>
              <p className="text-sm text-text-secondary leading-relaxed">
                {typeof voiceProfile[key] === 'string'
                  ? voiceProfile[key]
                  : Array.isArray(voiceProfile[key])
                    ? voiceProfile[key].join(', ')
                    : JSON.stringify(voiceProfile[key])}
              </p>
            </div>
          )
        ))}
      </div>

      {/* Sample outreach message — the wow moment */}
      <div className="bg-primary/5 border border-primary/30 rounded-xl p-4">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs text-primary-glow font-semibold">✨ Your first Clutch message</p>
          {sampleMessage && (
            <button
              onClick={handleCopy}
              className="text-xs text-primary-glow hover:underline transition-colors"
            >
              {copied ? 'Copied! ✓' : 'Copy'}
            </button>
          )}
        </div>
        {msgLoading ? (
          <div className="space-y-2 animate-pulse">
            <div className="h-3 bg-primary/20 rounded w-full" />
            <div className="h-3 bg-primary/15 rounded w-5/6" />
            <div className="h-3 bg-primary/10 rounded w-4/6" />
          </div>
        ) : sampleMessage ? (
          <p className="text-sm text-text-secondary leading-relaxed italic">"{sampleMessage}"</p>
        ) : (
          <p className="text-sm text-text-muted">Generating a sample outreach message in your voice…</p>
        )}
        {sampleMessage && (
          <p className="text-xs text-text-muted mt-2">
            This is what an AI-crafted message looks like using your profile. Clutch generates these for every lead you find.
          </p>
        )}
      </div>

      <div className="bg-surface-panel border border-surface-border rounded-xl p-4">
        <p className="text-xs text-primary-glow font-medium mb-1">🎯 What happens next</p>
        <p className="text-sm text-text-muted">Clutch will set up your personalized growth feed and find your first opportunities. Takes 1-2 minutes.</p>
      </div>

      <Button fullWidth loading={loading} onClick={handleComplete}>
        Enter FounderSales →
      </Button>
    </div>
  )
}

// ── Main Onboarding Wizard ────────────────────────────────────────────────────
export default function OnboardingPage() {
  const [step, setStep]               = useState(0)
  const [burst1, setBurst1]           = useState([])
  const [basicInfo, setBasicInfo]     = useState(null)
  const [voiceProfile, setVoiceProfile] = useState(null)
  const [loading, setLoading]         = useState(false)
  const { updateUser, user }          = useAuthStore()
  const navigate                      = useNavigate()

  useEffect(() => {
    if (user?.onboarding_completed) navigate('/dashboard', { replace: true })
  }, [user, navigate])

  const handleStep1Complete = ({ burst1: qs, basicInfo: info, aiSource }) => {
    setLoading(true)
    setBurst1(qs || [])
    setBasicInfo(info)
    setStep(1)
    setTimeout(() => setLoading(false), 300)
    if (aiSource === 'fallback') {
      toast('Using template questions — AI personalisation unavailable right now', {
        icon: '⚠️', style: { fontSize: '13px' },
      })
    }
  }

  const handleStep2Complete = ({ voiceProfile: vp }) => {
    setVoiceProfile(vp)
    setStep(2)
  }

  // FIX-05: handler to reset back to Step 1 from Q1 of Burst 1
  const handleBackToStep1 = () => {
    setBurst1([])
    setBasicInfo(null)
    setStep(0)
  }

  const handleComplete = () => {
    updateUser({ onboarding_completed: true })
    navigate('/welcome')  // first-win flow — shows first lead before dashboard
  }

  return (
    <div className="min-h-screen bg-surface-bg grid-bg flex items-center justify-center p-4">
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-[600px] h-[400px] bg-primary/4 rounded-full blur-3xl pointer-events-none" />
      <div className="w-full max-w-lg relative">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center">
              <svg viewBox="0 0 24 24" fill="none" className="w-4 h-4 text-primary-glow">
                <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <span className="text-sm font-semibold text-text-primary">FounderSales</span>
          </div>
          <span className="text-xs text-text-muted">Step {step + 1} of 3</span>
        </div>

        <ProgressBar step={step} total={3} />

        <div className="bg-surface-card border border-surface-border rounded-2xl p-6 shadow-modal">
          {step === 0 && <Step1 onNext={handleStep1Complete} />}
          {step === 1 && (loading
            ? <div className="space-y-4 py-4"><SkeletonText lines={5} /></div>
            : <Step2
                burst1={burst1}
                basicInfo={basicInfo}
                onNext={handleStep2Complete}
                onBack={handleBackToStep1}   // FIX-05: enables ← Edit info at Q1/Burst 1
              />
          )}
          {step === 2 && <Step3 voiceProfile={voiceProfile} onComplete={handleComplete} />}
        </div>
      </div>
    </div>
  )
}
