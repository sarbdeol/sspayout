const getAgentHandler = (apiEndpoint) => {
  if (!apiEndpoint) return require('./indopay');
  
  if (apiEndpoint.includes('bhumipay')) return require('./bhumipay');
  if (apiEndpoint.includes('indupay') || apiEndpoint.includes('bytexhub')) return require('./indopay');
  if (apiEndpoint.includes('solwio.in') || apiEndpoint.includes('godemo.in')) return require('./solwio');
  if (apiEndpoint.includes('handypay.co.in')) return require('./handypay');
  
  // Default fallback
  console.log('Unknown agent endpoint, using indopay handler:', apiEndpoint);
  return require('./indopay');
};

module.exports = { getAgentHandler };