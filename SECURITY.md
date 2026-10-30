# Security policy

## Reporting a vulnerability

Report privately through GitHub: the repository's **Security** tab, **Report a vulnerability**. Please do not open a public issue, pull request or discussion for a security problem.

A useful report says what is affected (file, function, commit), how to reproduce it, and what an attacker gains. You get an acknowledgement within seven days and a decision with a plan within thirty. A fix is released before the details are published, and the report is credited unless you ask otherwise.

## Scope

- The code in this repository, on the `main` branch. There are no released versions yet; fixes land on `main`.
- Of particular interest: a crafted PLY, PCD or TIFF file that makes a reader read out of bounds, hang or allocate without limit, and anything that lets data shown in the page run script in it.
- Not in scope: the data sets themselves, MATLAB itself (report that to MathWorks), and reports from automated scanners without a demonstrated impact.
