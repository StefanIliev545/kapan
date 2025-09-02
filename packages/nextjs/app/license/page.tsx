import React from "react";
import Link from "next/link";

export const metadata = {
  title: "License | Kapan Finance",
};

const LicensePage = () => {
  return (
    <div className="container mx-auto px-4 py-8 prose">
      <h1>License</h1>
      <p>
        The software and information provided by Kapan Finance are offered on an "as is" and "as available" basis
        without warranties of any kind, either express or implied. This includes but is not limited to implied
        warranties of merchantability, fitness for a particular purpose, and noninfringement.
      </p>
      <p>
        In no event shall the authors or copyright holders be liable for any claim, damages, or other liability, whether
        in an action of contract, tort, or otherwise, arising from, out of, or in connection with the software or the
        use or other dealings in the software.
      </p>
      <p>
        By using this site or the associated software, you agree that you do so at your own risk. For more details,
        please review the repository on
        <Link href="https://github.com/stefaniliev545/kapan">GitHub</Link>.
      </p>
    </div>
  );
};

export default LicensePage;
