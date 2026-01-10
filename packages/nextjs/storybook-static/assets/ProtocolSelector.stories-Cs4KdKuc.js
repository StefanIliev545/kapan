import{j as o}from"./jsx-runtime-CcWEvojh.js";import{P as e}from"./ProtocolSelector-3GjdsNco.js";import"./index-kA4PVysc.js";import"./index-Bk_d_yAU.js";import"./_commonjsHelpers-CE1G-McA.js";import"./ProtocolDropdownItem-DLoI1xHs.js";import"./next-image-DV_ejeD4.js";import"./protocol-B00D1UZQ.js";import"./externalContracts-_f_8pMJw.js";import"./formatPercentage-BDNxS5DB.js";import"./ChevronDownIcon-BxlGDZ4k.js";const r=()=>{},D={title:"Common/ProtocolSelector",component:e,parameters:{layout:"centered"},tags:["autodocs"]},t=[{name:"aave",supplyRate:3.5,borrowRate:4.2},{name:"compound",supplyRate:4.2,borrowRate:5.1,isOptimal:!0},{name:"morpho",supplyRate:2.8,borrowRate:3.5}],S=[{name:"aave",supplyRate:3.5,borrowRate:4.2},{name:"compound",supplyRate:4.2,borrowRate:5.1,isOptimal:!0},{name:"morpho",supplyRate:2.8,borrowRate:3.5,disabled:!0,disabledReason:"Insufficient liquidity"}],s={render:()=>o.jsx("div",{className:"w-80",children:o.jsx(e,{protocols:t,selectedProtocol:"aave",onSelect:r,label:"Select Protocol"})})},c={render:()=>o.jsx("div",{className:"w-80",children:o.jsx(e,{protocols:t,selectedProtocol:"",onSelect:r,label:"Select Protocol",placeholder:"Choose a protocol..."})})},l={render:()=>o.jsx("div",{className:"w-96",children:o.jsx(e,{variant:"grid",protocols:t,selectedProtocol:"compound",onSelect:r,label:"Select Protocol",rateType:"supply"})})},a={render:()=>o.jsx("div",{className:"w-96",children:o.jsx(e,{variant:"grid",protocols:t,selectedProtocol:"compound",onSelect:r,label:"Select Protocol",currentRate:3,rateType:"supply",showRateBadges:!0})})},n={render:()=>o.jsx("div",{className:"w-96",children:o.jsx(e,{variant:"tiles",protocols:t,selectedProtocol:"aave",onSelect:r,label:"Protocol"})})},d={render:()=>o.jsx("div",{className:"w-72",children:o.jsx(e,{protocols:t,selectedProtocol:"aave",onSelect:r,label:"Protocol",compact:!0})})},i={render:()=>o.jsx("div",{className:"w-80",children:o.jsx(e,{protocols:[],selectedProtocol:"",onSelect:r,label:"Select Protocol",isLoading:!0})})},p={render:()=>o.jsx("div",{className:"w-80",children:o.jsx(e,{protocols:t,selectedProtocol:"aave",onSelect:r,label:"Select Protocol",disabled:!0})})},m={render:()=>o.jsx("div",{className:"w-80",children:o.jsx(e,{protocols:S,selectedProtocol:"aave",onSelect:r,label:"Select Protocol"})})},v={render:()=>o.jsx("div",{className:"w-80",children:o.jsx(e,{protocols:t,selectedProtocol:"compound",onSelect:r,label:"Select Borrow Protocol",rateType:"borrow"})})},u={render:()=>o.jsxs("div",{className:"flex flex-col gap-8 p-4",children:[o.jsxs("div",{children:[o.jsx("h3",{className:"text-sm font-semibold mb-2",children:"Dropdown"}),o.jsx("div",{className:"w-80",children:o.jsx(e,{variant:"dropdown",protocols:t,selectedProtocol:"aave",onSelect:r})})]}),o.jsxs("div",{children:[o.jsx("h3",{className:"text-sm font-semibold mb-2",children:"Grid"}),o.jsx("div",{className:"w-96",children:o.jsx(e,{variant:"grid",protocols:t,selectedProtocol:"compound",onSelect:r,rateType:"supply"})})]}),o.jsxs("div",{children:[o.jsx("h3",{className:"text-sm font-semibold mb-2",children:"Tiles"}),o.jsx("div",{className:"w-96",children:o.jsx(e,{variant:"tiles",protocols:t,selectedProtocol:"morpho",onSelect:r})})]})]})};s.parameters={...s.parameters,docs:{...s.parameters?.docs,source:{originalSource:`{
  render: () => <div className="w-80">
      <ProtocolSelector protocols={protocols} selectedProtocol="aave" onSelect={noop} label="Select Protocol" />
    </div>
}`,...s.parameters?.docs?.source}}};c.parameters={...c.parameters,docs:{...c.parameters?.docs,source:{originalSource:`{
  render: () => <div className="w-80">
      <ProtocolSelector protocols={protocols} selectedProtocol="" onSelect={noop} label="Select Protocol" placeholder="Choose a protocol..." />
    </div>
}`,...c.parameters?.docs?.source}}};l.parameters={...l.parameters,docs:{...l.parameters?.docs,source:{originalSource:`{
  render: () => <div className="w-96">
      <ProtocolSelector variant="grid" protocols={protocols} selectedProtocol="compound" onSelect={noop} label="Select Protocol" rateType="supply" />
    </div>
}`,...l.parameters?.docs?.source}}};a.parameters={...a.parameters,docs:{...a.parameters?.docs,source:{originalSource:`{
  render: () => <div className="w-96">
      <ProtocolSelector variant="grid" protocols={protocols} selectedProtocol="compound" onSelect={noop} label="Select Protocol" currentRate={3.0} rateType="supply" showRateBadges />
    </div>
}`,...a.parameters?.docs?.source}}};n.parameters={...n.parameters,docs:{...n.parameters?.docs,source:{originalSource:`{
  render: () => <div className="w-96">
      <ProtocolSelector variant="tiles" protocols={protocols} selectedProtocol="aave" onSelect={noop} label="Protocol" />
    </div>
}`,...n.parameters?.docs?.source}}};d.parameters={...d.parameters,docs:{...d.parameters?.docs,source:{originalSource:`{
  render: () => <div className="w-72">
      <ProtocolSelector protocols={protocols} selectedProtocol="aave" onSelect={noop} label="Protocol" compact />
    </div>
}`,...d.parameters?.docs?.source}}};i.parameters={...i.parameters,docs:{...i.parameters?.docs,source:{originalSource:`{
  render: () => <div className="w-80">
      <ProtocolSelector protocols={[]} selectedProtocol="" onSelect={noop} label="Select Protocol" isLoading />
    </div>
}`,...i.parameters?.docs?.source}}};p.parameters={...p.parameters,docs:{...p.parameters?.docs,source:{originalSource:`{
  render: () => <div className="w-80">
      <ProtocolSelector protocols={protocols} selectedProtocol="aave" onSelect={noop} label="Select Protocol" disabled />
    </div>
}`,...p.parameters?.docs?.source}}};m.parameters={...m.parameters,docs:{...m.parameters?.docs,source:{originalSource:`{
  render: () => <div className="w-80">
      <ProtocolSelector protocols={protocolsWithDisabled} selectedProtocol="aave" onSelect={noop} label="Select Protocol" />
    </div>
}`,...m.parameters?.docs?.source}}};v.parameters={...v.parameters,docs:{...v.parameters?.docs,source:{originalSource:`{
  render: () => <div className="w-80">
      <ProtocolSelector protocols={protocols} selectedProtocol="compound" onSelect={noop} label="Select Borrow Protocol" rateType="borrow" />
    </div>
}`,...v.parameters?.docs?.source}}};u.parameters={...u.parameters,docs:{...u.parameters?.docs,source:{originalSource:`{
  render: () => <div className="flex flex-col gap-8 p-4">
      <div>
        <h3 className="text-sm font-semibold mb-2">Dropdown</h3>
        <div className="w-80">
          <ProtocolSelector variant="dropdown" protocols={protocols} selectedProtocol="aave" onSelect={noop} />
        </div>
      </div>
      <div>
        <h3 className="text-sm font-semibold mb-2">Grid</h3>
        <div className="w-96">
          <ProtocolSelector variant="grid" protocols={protocols} selectedProtocol="compound" onSelect={noop} rateType="supply" />
        </div>
      </div>
      <div>
        <h3 className="text-sm font-semibold mb-2">Tiles</h3>
        <div className="w-96">
          <ProtocolSelector variant="tiles" protocols={protocols} selectedProtocol="morpho" onSelect={noop} />
        </div>
      </div>
    </div>
}`,...u.parameters?.docs?.source}}};const T=["Dropdown","DropdownNoSelection","Grid","GridWithRateBadges","Tiles","Compact","Loading","Disabled","WithDisabledProtocols","BorrowRates","AllVariants"];export{u as AllVariants,v as BorrowRates,d as Compact,p as Disabled,s as Dropdown,c as DropdownNoSelection,l as Grid,a as GridWithRateBadges,i as Loading,n as Tiles,m as WithDisabledProtocols,T as __namedExportsOrder,D as default};
