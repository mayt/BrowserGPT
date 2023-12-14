export async function goToLink(page, link) {
  console.log('Navigating to'.green);
  await page.goto(link);
  console.log(link);
  console.log('EOF'.green);
  return true;
}
