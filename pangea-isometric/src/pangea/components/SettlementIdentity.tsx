import type { CSSProperties } from 'react';
import { ArrowUpRight } from 'lucide-react';
import { deriveSettlementIdentity, type IdentityState, type IdentityTown, type SettlementEmblem } from '../simulation/identity.mjs';
import './identity.css';

function Emblem({emblem}:{emblem:SettlementEmblem}) {
  return <svg className="settlement-seal" viewBox="0 0 64 74" role="img" aria-label={`Derived settlement emblem: ${emblem.motif}`}>
    <path d="M4 4H60V43C60 56 45 66 32 71C19 66 4 56 4 43Z" fill={emblem.field} stroke={emblem.accent} strokeWidth="1.5"/>
    <path d="M10 10H54V42C54 51 43 59 32 64C21 59 10 51 10 42Z" fill="none" stroke={emblem.accent} strokeOpacity=".3"/>
    <g stroke={emblem.accent} fill="none" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      {emblem.motif==='sun'?<><circle cx="32" cy="33" r="9"/>{Array.from({length:8},(_,i)=><path key={i} d="M32 14V19" transform={`rotate(${i*45} 32 33)`}/>)}</>:
        emblem.motif==='chevron'?<><path d="M17 37L32 22L47 37M17 46L32 31L47 46"/></>:
        emblem.motif==='bars'?<><path d="M21 24V45M32 19V50M43 24V45M18 35H46"/></>:
        <><path d="M32 17L46 34L32 51L18 34Z"/><path d="M32 25L39 34L32 43L25 34Z"/></>}
    </g>
  </svg>;
}

export default function SettlementIdentity({state,town,onPerson,showMilestones=false}:{
  state:IdentityState;town:IdentityTown;onPerson?:(id:number)=>void;showMilestones?:boolean;
}) {
  const profile=deriveSettlementIdentity(state,town);
  const date=(day:number)=>`Year ${Math.floor(day/360)+1} · Day ${Math.floor(day%360)+1}`;
  return <div className="settlement-identity" style={{'--identity-accent':profile.emblem.accent} as CSSProperties}>
    <section className="identity-character" aria-label="Settlement character">
      <Emblem emblem={profile.emblem}/><div><span className="identity-eyebrow">Settlement character</span><h3>{profile.architecture.label}</h3><p>{profile.architecture.detail}</p></div>
    </section>
    <div className="identity-specialty"><span className="identity-eyebrow">Work that shapes this place</span><strong>{profile.specialty.label}</strong><p>{profile.specialty.detail}</p></div>
    {profile.families.length?<section className="identity-families" aria-label="Prominent family names"><div className="identity-section-heading"><h3>Family names</h3><span>Current residents</span></div>
      {profile.families.slice(0,3).map(f=><div className="identity-family" key={f.name}>{onPerson?<button onClick={()=>onPerson(f.memberIds[0])}>{f.name}<ArrowUpRight size={12}/></button>:<strong>{f.name}</strong>}<span>{f.count} {f.count===1?'resident':'residents'}</span></div>)}
      <p className="identity-footnote">Names shared by residents; ancestry is recorded in individual lives.</p>
    </section>:null}
    <p className="identity-origin">{profile.origin.constructed?'Constructed preview':`Founded ${date(profile.origin.day)}`}{profile.origin.parentName?` · From ${profile.origin.parentName}`:''}</p>
    {showMilestones?<section className="identity-milestones"><div className="identity-section-heading"><h3>Recorded milestones</h3></div>{profile.milestones.length?profile.milestones.map(e=><article key={e.id}><small>{date(e.day)}</small><h4>{e.title}</h4><p>{e.detail}</p></article>):<p>No settlement milestones remain in the current event log.</p>}<p className="identity-footnote">From the world&apos;s retained event log.</p></section>:null}
  </div>;
}
