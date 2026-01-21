(async function init() {
  // eslint-disable-next-line no-unused-vars
  const { context, token, actions } = await DA_SDK;
  Object.keys(context).forEach((key) => {
    const h3 = document.createElement('h3');
    h3.textContent = `${key}`;

    const para = document.createElement('p');
    para.textContent = context[key];

    document.body.append(h3, para);
  });
}());