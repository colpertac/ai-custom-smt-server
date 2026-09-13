function define(script)
{
    script.Name = "transforma_addItemDropRandom";
    script.Type = "ActionTransform";
    return 0;
}

// Transform an ActionCreateLoot command by adding a random key value pair
// to the Item Drop list with a rate of 100%.
// - params[0]+: Pair of item IDs and amounts
function transform(source, cState, dState, zone, params)
{
    if(params.len() < 2 || (params.len() % 2) != 0)
    {
        return -1;
    }

    local key = Randomizer.RNG(0, (params.len() / 2) - 1) * 2;

    local drop = ItemDrop();
    drop.SetItemType(params[key].tointeger());
    drop.SetRate(100.0);
    drop.SetMinStack(params[key + 1].tointeger());
    drop.SetMaxStack(params[key + 1].tointeger());

    action.AppendDrops(drop);

    return 0;
}