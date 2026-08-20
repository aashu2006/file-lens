/* Vercel serverless entry point.
 *
 * An Express app is itself a (req, res) handler, so Vercel can invoke it
 * directly. vercel.json rewrites every /api/* path here.
 */

export { default } from '../app.js';
