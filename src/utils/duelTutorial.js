import catalog from '../data/duelCatalog.json';
import { duelCombination } from './duelCombinations';

const creatures = Object.fromEntries(catalog.cards.map(c => [c.id,c]));
const card = (id, uid) => ({id,uid});
const monster = (id, uid, extra = {}) => ({...card(id,uid),afinidad:creatures[id].stars[0],posicion:'ataque',oculta:false,...extra});
const empty = () => Array(5).fill(null);
export const tutorialSteps = {
  welcome: ['Tu primer duelo', 'Jugarás una partida preparada contra la computadora. Comienzas con 4000 de vida. Sigue los bordes dorados; el tutorial espera a que hagas cada jugada.'],
  summon: ['Elige tu criatura', 'Toca Lechuza, la carta iluminada de tu mano. También puedes arrastrarla directamente al primer espacio de tu campo.'],
  drop: ['Llévala al campo', 'Arrastra Lechuza al primer espacio iluminado, o toca ese espacio. Puedes invocar una criatura o hacer una fusión por turno.'],
  flip: ['Oculta tu carta', 'Toca la carta para girarla boca abajo. Así tu rival no conocerá su identidad hasta que combata.'],
  place: ['Confirma la invocación', 'Toca «Colocar boca abajo». En el primer turno no puedes atacar; al invocar, pasa el turno automáticamente.'],
  cpuOpening: ['Turno de la computadora', 'La computadora coloca Doxy y decide esperar. Al comenzar tu siguiente turno, vuelves a completar cinco cartas en la mano.'],
  inspect: ['Recuerda tu carta', 'Mantén presionada tu Lechuza boca abajo durante medio segundo para verla en privado. Con teclado, enfócala y presiona Enter.'],
  closeInspection: ['Una consulta privada', 'Cierra la vista para continuar. Consultar tu carta no la revela al rival ni consume una jugada.'],
  selectDefense: ['Selecciona tu criatura', 'Toca una vez tu Lechuza. El primer toque solo la selecciona para atacar.'],
  defense: ['Cambia a defensa', 'Tócala otra vez: quedará horizontal, en defensa. Si recibe un ataque, se comparará con sus 1600 DEF.'],
  trap: ['Prepara una trampa', 'Toca Invisibilidad. Puedes usar una magia o preparar una trampa por turno, además de invocar una criatura.'],
  trapDrop: ['Coloca la trampa', 'Toca el primer espacio de magia y trampas. Invisibilidad quedará oculta y cancelará el siguiente ataque rival.'],
  endTurn: ['Cede el turno', 'Toca «Terminar turno». Las trampas se activan automáticamente cuando te atacan.'],
  cpuTrap: ['La computadora ataca', 'Doxy intenta atacar a Lechuza. Tu trampa está preparada para protegerla.'],
  trapAnimation: ['¡Trampa activada!', 'Invisibilidad cancela el ataque y se consume. Ninguno pierde vida.'],
  fusionFirst: ['Construye una fusión', 'Toca Bowtruckle. Los bordes y números del mismo color identifican las parejas que se pueden combinar.'],
  fusionSecond: ['Elige su pareja', 'Toca Doxy, que comparte el borde dorado con Bowtruckle. Juntos crean Acromántula.'],
  fusionDrop: ['Invoca la combinación', 'Toca el segundo espacio de tu campo. Una fusión usa dos cartas de tu mano y ocupa tu invocación del turno.'],
  fusionConfirm: ['Revisa el resultado', 'Confirma la fusión. Acromántula entra boca arriba con 1800 ATQ y 1400 DEF.'],
  fusionAnimation: ['¡Fusión!', 'Las dos cartas se convierten en una nueva criatura.'],
  boost: ['Refuerza tu criatura', 'Toca Engorgio. Esta magia aumenta 500 ATQ mientras tu criatura siga en el campo. También puedes combinarla con una criatura de la mano antes de invocarla.'],
  boostTarget: ['Elige quién recibe la magia', 'Toca Acromántula, en el segundo espacio. Pasará de 1800 a 2300 ATQ. Las magias se usan antes de comenzar a atacar.'],
  attackSelect: ['Prepara un ataque', 'Toca una vez Acromántula para seleccionarla. Ya tiene 2300 ATQ gracias a Engorgio.'],
  attackTarget: ['Ataca a Doxy', 'Toca el Doxy rival. Ambos están en ataque: 2300 contra 1400. Doxy se destruirá y el rival perderá los 900 de diferencia.'],
  attackAnimation: ['Daño y destrucción', 'El monstruo con menos ATQ se destruye y su dueño pierde la diferencia de vida.'],
  directSelect: ['Aprovecha el campo vacío', 'Toca Lechuza. Como ya no hay criaturas rivales, puede atacar directamente. Al atacar desde defensa, cambia automáticamente a ataque.'],
  directTarget: ['Ataque directo', 'Toca el espacio rival iluminado. Lechuza restará sus 1000 ATQ directamente a la vida de la computadora.'],
  directAnimation: ['Daño directo', 'El destello indica el ataque directo. Como tus dos criaturas ya atacaron, termina tu turno.'],
  cpuRebound: ['Un ataque desfavorable', 'Para mostrarte qué pasa al atacar a alguien más fuerte, la computadora invoca una Lechuza de 1000 ATQ y ataca a tu Acromántula de 2300.'],
  reboundAnimation: ['El ataque se devuelve', 'La Lechuza de la computadora se destruye y su dueño pierde 1300 de vida. Revisa siempre las estadísticas antes de atacar.'],
  finalSelect: ['Tu última jugada', 'Selecciona Acromántula. Al comenzar tu turno puede volver a atacar. Al rival solo le quedan 800 de vida.'],
  finalTarget: ['Termina el duelo', 'Toca el espacio rival iluminado para atacar directamente con 2300 ATQ y llevar su vida a cero.'],
  victoryAnimation: ['¡Victoria!', 'La vida de la computadora llegó a cero.'],
  complete: ['¡Tutorial completado!', 'Ya practicaste invocación, cartas ocultas, defensa, trampas, fusiones, magia y ataques. En duelos normales también cuentan las afinidades: una ventaja suma 300 en combate.']
};
export function createTutorial() {
  return {step:'welcome',round:1,life:4000,rivalLife:4000,hand:[card('lechuza','owl'),card('bowtruckle','bow'),card('doxy','doxy'),card('hechizo-invisibilidad','trap'),card('hechizo-engorgio','boost')],field:empty(),rivalField:empty(),supports:empty(),selected:[],event:null};
}
const refill = (hand, round) => [...hand,...Array.from({length:5-hand.length},(_,i)=>card(['elfo','duendecillo','lechuza','doxy','bowtruckle'][i],`draw-${round}-${i}`))];
const setSlot = (array,index,value) => array.map((c,i)=>i===index?value:c);
const advance = (s,step,updates={}) => ({...s,step,...updates});
const attackValue = c => creatures[c.id].atk+(c.bonusAtk||0);
// The lesson is deliberately scripted. Only the action for the current step can mutate it.
// It never calls arena RPCs, awards currency or alters a real duel.
export function tutorialReducer(s,a) {
  const go = (step,updates) => advance(s,step,updates);
  const remove = ids => s.hand.filter(c=>!ids.includes(c.uid));
  const own = (i,updates) => setSlot(s.field,i,{...s.field[i],...updates});
  const event = (step,details,updates={}) => go(step,{...updates,event:{id:step,tipo:'combate',actor:'a',danoActor:0,danoRival:0,...details}});
  switch (s.step) {
    case 'welcome': if(a.type==='START') return go('summon'); break;
    case 'summon':
    case 'drop':
      if(a.type==='DROP' && a.uid==='owl' && a.zone==='field' && a.index===0) return go('flip',{selected:['owl']});
      if(s.step==='summon' && a.type==='HAND' && a.uid==='owl') return go('drop',{selected:['owl']});
      if(s.step==='drop' && a.type==='FIELD' && a.index===0) return go('flip');
      break;
    case 'flip': if(a.type==='FLIP') return go('place'); break;
    case 'place': if(a.type==='PLACE') return go('cpuOpening',{field:setSlot(s.field,0,monster('lechuza','owl',{oculta:true})),hand:remove(['owl']),selected:[],round:2}); break;
    case 'cpuOpening': if(a.type==='CPU') return go('inspect',{rivalField:setSlot(s.rivalField,0,monster('doxy','cpu-doxy')),hand:refill(s.hand,3),round:3}); break;
    case 'inspect': if(a.type==='INSPECT' && a.index===0) return go('closeInspection'); break;
    case 'closeInspection': if(a.type==='CLOSE') return go('selectDefense'); break;
    case 'selectDefense': if(a.type==='FIELD' && a.index===0) return go('defense',{selected:['owl']}); break;
    case 'defense': if(a.type==='FIELD' && a.index===0) return go('trap',{field:own(0,{posicion:'defensa'}),selected:[]}); break;
    case 'trap': if(a.type==='HAND' && a.uid==='trap') return go('trapDrop',{selected:['trap']}); break;
    case 'trapDrop': if(a.type==='SUPPORT' && a.index===0) return go('endTurn',{supports:setSlot(s.supports,0,{...s.hand.find(c=>c.uid==='trap'),oculta:true}),hand:remove(['trap']),selected:[]}); break;
    case 'endTurn': if(a.type==='END') return go('cpuTrap',{round:4}); break;
    case 'cpuTrap': if(a.type==='CPU') return event('trapAnimation',{actor:'b',atacante:s.rivalField[0],defensor:{oculta:true},ataque:attackValue(s.rivalField[0]),trampa:'hechizo-invisibilidad'},{supports:empty()}); break;
    case 'trapAnimation': if(a.type==='ANIMATION_DONE') return go('fusionFirst',{event:null,round:5,hand:refill(s.hand,5)}); break;
    case 'fusionFirst': if(a.type==='HAND' && a.uid==='bow') return go('fusionSecond',{selected:['bow']}); break;
    case 'fusionSecond': if(a.type==='HAND' && a.uid==='doxy') return go('fusionDrop',{selected:['bow','doxy']}); break;
    case 'fusionDrop': if(a.type==='FIELD' && a.index===1) return go('fusionConfirm'); break;
    case 'fusionConfirm': if(a.type==='PLACE') {
      const result=duelCombination(s.hand.find(c=>c.uid==='bow'),s.hand.find(c=>c.uid==='doxy'));
      return event('fusionAnimation',{tipo:'fusion',ingredientes:['bowtruckle','doxy'],resultado:result.id},{field:setSlot(s.field,1,monster(result.id,'fusion')),hand:remove(['bow','doxy']),selected:[]});
    } break;
    case 'fusionAnimation': if(a.type==='ANIMATION_DONE') return go('boost',{event:null}); break;
    case 'boost': if(a.type==='HAND' && a.uid==='boost') return go('boostTarget',{selected:['boost']}); break;
    case 'boostTarget': if(a.type==='FIELD' && a.index===1) return go('attackSelect',{field:own(1,{bonusAtk:500}),hand:remove(['boost']),selected:[]}); break;
    case 'attackSelect': if(a.type==='FIELD' && a.index===1) return go('attackTarget',{selected:['fusion']}); break;
    case 'attackTarget': if(a.type==='RIVAL' && a.index===0) {
      const attack=attackValue(s.field[1]), defense=attackValue(s.rivalField[0]),damage=attack-defense;
      return event('attackAnimation',{atacante:s.field[1],defensor:s.rivalField[0],ataque:attack,defensa:defense,danoRival:damage,destruidoRival:true},{field:own(1,{ataco:true}),rivalField:empty(),rivalLife:s.rivalLife-damage,selected:[]});
    } break;
    case 'attackAnimation': if(a.type==='ANIMATION_DONE') return go('directSelect',{event:null}); break;
    case 'directSelect': if(a.type==='FIELD' && a.index===0) return go('directTarget',{selected:['owl']}); break;
    case 'directTarget': if(a.type==='RIVAL' && a.index===0) return event('directAnimation',{atacante:{...s.field[0],oculta:false,posicion:'ataque'},directo:true,ataque:attackValue(s.field[0]),danoRival:attackValue(s.field[0])},{field:own(0,{ataco:true,posicion:'ataque',oculta:false}),rivalLife:s.rivalLife-attackValue(s.field[0]),selected:[]}); break;
    case 'directAnimation': if(a.type==='ANIMATION_DONE') return go('cpuRebound',{event:null,round:6}); break;
    case 'cpuRebound': if(a.type==='CPU') {
      const attacker=monster('lechuza','cpu-owl'),attack=attackValue(attacker),defense=attackValue(s.field[1]),damage=defense-attack;
      return event('reboundAnimation',{actor:'b',atacante:attacker,defensor:s.field[1],ataque:attack,defensa:defense,danoActor:damage,destruidoActor:true},{rivalLife:s.rivalLife-damage});
    } break;
    case 'reboundAnimation': if(a.type==='ANIMATION_DONE') return go('finalSelect',{event:null,round:7,field:s.field.map(c=>c?{...c,ataco:false}:null),hand:refill(s.hand,7)}); break;
    case 'finalSelect': if(a.type==='FIELD' && a.index===1) return go('finalTarget',{selected:['fusion']}); break;
    case 'finalTarget': if(a.type==='RIVAL' && a.index===0) return event('victoryAnimation',{atacante:s.field[1],directo:true,ataque:attackValue(s.field[1]),danoRival:attackValue(s.field[1])},{rivalLife:0,selected:[]}); break;
    case 'victoryAnimation': if(a.type==='ANIMATION_DONE') return go('complete',{event:null}); break;
    default: break;
  }
  return s;
}

export function tutorialTargets(step) {
  const targets = {
    summon:['hand:owl'],drop:['hand:owl','field:0'],flip:['flip'],place:['place'],inspect:['field:0'],closeInspection:['close'],
    selectDefense:['field:0'],defense:['field:0'],trap:['hand:trap'],trapDrop:['support:0'],endTurn:['end'],
    fusionFirst:['hand:bow'],fusionSecond:['hand:doxy'],fusionDrop:['field:1'],fusionConfirm:['place'],boost:['hand:boost'],
    boostTarget:['field:1'],attackSelect:['field:1'],attackTarget:['rival:0'],directSelect:['field:0'],directTarget:['rival:0'],finalSelect:['field:1'],finalTarget:['rival:0']
  };
  return targets[step] || [];
}
