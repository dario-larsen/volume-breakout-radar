// Farm plans for the Breakout Radar, shared by main.ts and the dashboard page.
// One file, one generator: the detail view shows exactly the steps board.json
// carries. No network, no names special-cased: every step is derived from the
// protocol's own record (category, chains, TVL, 7-day change, age).
//
// The plan is five steps. Each carries what it costs and how long it takes:
// a reader should know the price of farming before they start, not after.
(function () {
  'use strict';

  /** The first chain a protocol names, or a neutral phrase. */
  function chainOf(p) {
    return p.chains && p.chains.length > 0 ? p.chains[0] : 'its main chain';
  }

  /** How much capital one farm position needs, from the protocol's own TVL. */
  function capitalFor(p) {
    if (p.tvl_usd >= 1000000000) return 200;
    if (p.tvl_usd >= 100000000) return 120;
    return 60;
  }

  /** How long to hold, from the protocol's age: young breakouts need the longest window. */
  function holdDaysFor(age) {
    if (age === null) return 60;
    if (age < 180) return 90;
    if (age < 365) return 60;
    return 45;
  }

  /** Whether this protocol's volume is breaking out right now. */
  function isHot(p) {
    return p.change_7d !== null && p.change_7d >= 20;
  }

  /** The category's one action, in words a farmer can follow. */
  function actionFor(p, capital, chain) {
    var c = (p.category || '').toLowerCase();
    var name = p.name;
    if (c.indexOf('lend') !== -1 || c.indexOf('cdp') !== -1 || c.indexOf('collateral') !== -1) {
      return 'Lend $' + capital + ' of USDC into ' + name + ' on ' + chain + ': deposit, confirm the receipt, and leave the position open.';
    }
    if (c.indexOf('dex') !== -1) {
      return 'Add $' + capital + ' of liquidity to the busiest ' + name + ' pool on ' + chain + ' and keep the position in range.';
    }
    if (c.indexOf('bridge') !== -1 || c.indexOf('cross chain') !== -1) {
      return 'Bridge $' + capital + ' of USDC into ' + chain + ' through ' + name + ', then use the bridged funds inside its app.';
    }
    if (c.indexOf('stak') !== -1 || c.indexOf('restak') !== -1) {
      return 'Stake $' + capital + ' of the chain staking asset through ' + name + ' on ' + chain + ' and keep the receipt token.';
    }
    if (c.indexOf('perp') !== -1 || c.indexOf('deriv') !== -1 || c.indexOf('basis') !== -1) {
      return 'Deposit $' + capital + ' of USDC as margin on ' + name + ', open one small hedged position, and close it within the week.';
    }
    if (c.indexOf('yield') !== -1 || c.indexOf('vault') !== -1 || c.indexOf('allocat') !== -1 || c.indexOf('curator') !== -1) {
      return 'Deposit $' + capital + ' into a ' + name + ' vault on ' + chain + ' and hold the vault shares, not the underlying.';
    }
    if (c.indexOf('rwa') !== -1) {
      return 'Mint $' + capital + ' of the yield-bearing asset ' + name + ' issues on ' + chain + ' and hold it in the farm wallet.';
    }
    if (c.indexOf('payment') !== -1) {
      return 'Route $' + capital + ' of real payments through ' + name + ' on ' + chain + ' across the week, not in one transaction.';
    }
    if (c.indexOf('insurance') !== -1 || c.indexOf('risk') !== -1) {
      return 'Buy $' + capital + ' of cover from ' + name + ' on ' + chain + ' and keep the policy active for the whole hold.';
    }
    if (c.indexOf('stable') !== -1) {
      return 'Mint or hold $' + capital + ' of the stable asset through ' + name + ' on ' + chain + ' and keep it in the farm wallet.';
    }
    if (c.indexOf('govern') !== -1) {
      return 'Deposit $' + capital + ' into ' + name + ' on ' + chain + ' and vote on its next live proposal from the farm wallet.';
    }
    if (c.indexOf('chain') !== -1) {
      return 'Bridge $' + capital + ' of USDC to ' + name + "'s chain and use one native app there every week.";
    }
    return 'Deposit $' + capital + ' of USDC into ' + name + ' on ' + chain + ' and keep the position open.';
  }

  /** One step as a single string: its action, then its cost and time. */
  function stepText(text, cost, time) {
    var s = text + ' Cost: ' + cost + '. Time: ' + time + '.';
    if (s.length > 600) s = s.slice(0, 596) + '...';
    if (s.length < 20) s = s + ' Hold the position and check the protocol page.';
    return s;
  }

  /** A protocol's farm plan: five steps, each with a cost and a time. */
  function farmSteps(p) {
    var chain = chainOf(p);
    var capital = capitalFor(p);
    var hold = holdDaysFor(p.age_days === undefined ? null : p.age_days);
    var hot = isHot(p);
    var gas = capital >= 120 ? 8 : 4;
    var cadence = hot
      ? 'Repeat a qualifying action twice a week while the 7-day TVL growth stays above 20%: one more deposit or one swap each time, so the wallet rides the breakout instead of watching it.'
      : 'Do one qualifying action each week — a deposit, a swap, a borrow or a vote — so the wallet stays active through the whole hold.';
    return [
      stepText(
        'Open a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.',
        'under $3 of gas for the first transaction',
        '5 minutes',
      ),
      stepText(actionFor(p, capital, chain), '$' + capital + ' of capital plus about $' + gas + ' of gas', '15 minutes to set up'),
      stepText(cadence, 'about $2 of gas a week', '10 minutes a week'),
      stepText(
        'Keep the position open for at least ' + hold + ' days so the activity spans more than one snapshot window.',
        'the $' + capital + ' stays in the position',
        hold + ' days',
      ),
      stepText(
        "Check " + p.name + "'s own points page for the farm wallet, claim only from the link the protocol itself publishes, and write the wallet, the dates and every transaction in a farm log.",
        'nothing to check, and never pay to claim',
        '10 minutes',
      ),
    ];
  }

  globalThis.FarmPlan = { farmSteps: farmSteps, stepText: stepText, capitalFor: capitalFor, holdDaysFor: holdDaysFor, isHot: isHot };
})();
