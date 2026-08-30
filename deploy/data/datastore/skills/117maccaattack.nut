local MAX_COST = 10000;

function define(script)
{
    script.Name = "Macca Attack (117)";
    script.Type = "SkillLogic";
    return 0;
}

function prepare(settings)
{
    settings.FunctionID = 117;
    settings.HasActivationValidation = true;
    settings.HasExecutionValidation = true;
    settings.HasCostAdjustment = true;
    settings.HasPreAction = true;
    settings.HasPostAction = true;

    return 0;
}

function validateActivation(source, cState, dState, skill, zone)
{
    local totalMacca = getTotalMacca(source);
    if(totalMacca <= 0)
    {
        // Activation state invalid
        return 1;
    }

    return 0;
}

function validateExecution(source, cState, dState, skill, zone)
{
    local totalMacca = getTotalMacca(source);
    if(totalMacca <= 0)
    {
        // Execution state invalid
        return 1;
    }

    return 0;
}

function adjustCost(source, cState, dState, skill, zone)
{
    local totalMacca = getTotalMacca(source);
    if(totalMacca <= 0)
    {
        // Cost not payable
        return 1;
    }

    // Pay 10% or 10,000
    local cost = totalMacca / 10;
    if(cost > MAX_COST)
    {
        cost = MAX_COST;
    }
    else if(cost < 0)
    {
        // Floor at 1
        cost = 1;
    }

    skill.Activated.SetItemCostsEntry(799, cost);

    // Let skill processor check for ability to pay
    return 0;
}

function preAction(source, cState, dState, skill, zone, targetStates, server)
{
    // Transform modifiers based on cost as it can only execute or fizzle past
    // this point
    local cost = skill.Activated.GetItemCostsByKey(799);

    // Modifiers change to percent of max cost
    skill.Modifier1 = (skill.Modifier1 * ((cost * 1.0) / MAX_COST))
        .tointeger();
    skill.Modifier2 = (skill.Modifier2 * ((cost * 1.0) / MAX_COST))
        .tointeger();

    return 0;
}

function postAction(source, cState, dState, skill, zone, targets, server)
{
    // Print a message to the user to remind them that they're literally
    // throwing money away
    server.GetAIManager().StartEvent(cState, "skill_maccaAttack");

    return 0;
}

function getTotalMacca(source)
{
    local cState = CharacterState.Cast(source);
    if(cState == null)
    {
        // Character source only
        return -1;
    }

    local character = cState.GetEntity();
    local inventory = character
        ? character.GetItemBoxesByIndex(0).Get() : null;
    if(inventory == null)
    {
        // Should never happen
        return -1;
    }

    local itemType = 799;    // Macca
    local itemCount = 0;
    for(local k = 0; k < 50; k++)
    {
        local item = inventory.GetItemsByIndex(k).Get();
        if(item && item.GetType() == itemType)
        {
            itemCount += item.GetStackSize();
        }
    }

    return itemCount;
}