function define(script)
{
    script.Name = "transforma_transactionPlasma";
    script.Type = "ActionTransform";
    return 0;
}

// Transform an ActionSetNPCState command by randomly picking a false plasma
// object to show and enabling the real plasma in the same area based upon
// the player LNC and relative IDs. The plasma object actor IDs should match
// the spot IDs the are placed at offset by LNC index * 100000;
// -params[0]: Zone character flag which contains the current area ID
// -params[1]: Number of plasma spots in each area
function transform(source, cState, dState, zone, params)
{
    local character = cState != null ? cState.GetEntity() : null;
    if(character == null || zone == null)
    {
        return -1;
    }

    local lncType = -1;
    if(character.GetLNC() >= 5000)
    {
        lncType = 2;
    }
    else if(character.GetLNC() <= -5000)
    {
        lncType = 0;
    }
    else
    {
        lncType = 1;
    }

    local area = zone.GetFlagState(params[0].tointeger(), 0,
        cState.GetWorldCID());
    if(area <= 0)
    {
        return -1;
    }

    local minSpot = (lncType * 100000) + 20000 + (area * 100) + 1;
    local maxSpot = minSpot + (params[1].tointeger() - 1);
    local objSpot = Randomizer.RNG(minSpot, maxSpot);

    for(local spot = minSpot; spot <= maxSpot; spot++)
    {
        if(spot == objSpot)
        {
            action.SetActorID(spot);
        }
        else
        {
            local pState = zone.GetPlasma(spot);
            if(pState == null)
            {
                return -1;
            }

            pState.Toggle(true, true);
        }
    }

    return 0;
}