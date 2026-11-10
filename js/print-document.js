async function printLogiTrakDocument(root) {
  try {
    await Promise.all([...root.querySelectorAll('img')].map(image => image.decode()));
  } catch (error) {
    console.warn('Logo non chargé pour impression',error);
    window.alert('Le logo n’a pas pu être chargé. Actualisez la page avant d’imprimer.');
    return;
  }
  window.print();
}
