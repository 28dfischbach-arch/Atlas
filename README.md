# Atlas

Atlas is a multi-app web platform that bundles a variety of productivity and utility applications into a single project. This README provides an overview of the project structure and instructions on how to get started after extracting the `Atlas.zip` archive.

## Project Structure

After unzipping, your directory will look like this:

- **index.html** — Main entry point for the Atlas dashboard or landing page
- **favicon.svg**, **opengraph.jpg** — Branding and social sharing assets
- **vendor/** — Third-party libraries (e.g., `anime.min.js`, `xlsx.full.min.js`, `chart.umd.min.js`, `peerjs.min.js`, `jszip.min.js`)
- **js/** — Core JavaScript files for the platform (`main.js`, `advisor.js`)
- **css/** — Core stylesheet(s) for the platform (`main.css`)
- **apps/** — All bundled apps live here, each in its own folder:
  - **editor/**: A web-based editor application
  - **drive/**: File storage/management app
  - **mail/**: Email client
  - **store/**: App store or extension center
  - **sitebuilder/**: Website builder
  - **calendar/**: Calendar and scheduling app
  - **splitter/**: Split view or file comparison tool
  - **advisore/**: Advisor or assistant app
  - **settings/**: Settings and configuration app
  - **artlab/**: Art or graphics lab
  - **chat/**: Chat or messaging app
  - **stck/**: Stack or shim utility
  - **dashboard/**: Central dashboard app

Each app folder typically contains its own `index.html`, `js/` (JavaScript), and `css/` (styles) subfolders. Some apps also include icons and manifest files.

## Getting Started

1. **Unzip the Archive**
   - Extract `Atlas.zip` to your desired workspace directory. (You may see a folder named `Atlas (1)` if the folder already existed.)
2. **Open index.html**
   - Start with `index.html` in the root to launch the main dashboard.
3. **Explore Apps**
   - Open individual apps by navigating into the respective folders inside `apps/` and launching their `index.html` files.
4. **Dependencies**
   - All required third-party libraries are included in the `vendor/` folder. No additional installation should be necessary for standard browser use.

## Notes
- This project appears to run entirely client-side; you don't need a server unless specific apps require it.
- If you need to rename the folder from `Atlas (1)` to `Atlas` for consistency, you can do so.
- For development, editing, or customization, open files using your preferred code editor or IDE.

## License
Include your license information here if applicable.

---

**Contact:** For questions or support, add your contact info or GitHub link here.